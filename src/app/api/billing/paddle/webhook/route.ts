import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { verifyPaddleWebhookSignature } from "@/server/billing/providers/paddle/verify-webhook-signature";
import { handleWebhookEvent } from "@/server/billing/providers/paddle/handle-webhook-event";
import { paddleWebhookEnvelopeSchema } from "@/server/billing/providers/paddle/paddle-types";
import { logWebhookReceived } from "@/server/billing/billing-log";
import { persistBillingEventFirst } from "@/server/billing/webhooks/persist-first";
import { updateBillingEventStatus } from "@/server/billing/webhooks/update-event-status";
import { logWebhookReplayDetected, logWebhookSignatureInvalid } from "@/server/security-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
/** Paddle may send application/json or application/json; charset=utf-8 (with or without space). */
function isJsonContentType(header: string | null): boolean {
  const v = header?.trim().toLowerCase() ?? "";
  return v === "application/json" || v.startsWith("application/json;");
}

export async function GET() {
  return apiError("METHOD_NOT_ALLOWED", 405, "POST only");
}

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return apiError("METHOD_NOT_ALLOWED", 405, "POST only");
  }

  if (!isJsonContentType(req.headers.get("content-type"))) {
    return apiError("UNSUPPORTED_MEDIA_TYPE", 415, "Content-Type must be application/json");
  }

  let rawBody: string;
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!Number.isFinite(len) || len > MAX_BODY_BYTES) {
        return apiError("PAYLOAD_TOO_LARGE", 413, "Request body too large");
      }
    }
    rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return apiError("PAYLOAD_TOO_LARGE", 413, "Request body too large");
    }
  } catch {
    return apiError("BAD_REQUEST", 400, "Invalid request body");
  }

  const signatureHeader = req.headers.get("paddle-signature");
  try {
    verifyPaddleWebhookSignature(rawBody, signatureHeader);
  } catch {
    logWebhookSignatureInvalid({
      provider: "paddle",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    logWebhookReceived({
      eventType: "unknown",
      providerEventId: "unknown",
      result: "signature_invalid",
    });
    return apiError("BAD_REQUEST", 400, "Webhook signature verification failed");
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return apiError("VALIDATION_ERROR", 400, "Invalid JSON");
  }

  const envelopeResult = paddleWebhookEnvelopeSchema.safeParse(envelope);
  if (!envelopeResult.success) {
    return apiError("VALIDATION_ERROR", 400, "Invalid webhook payload schema");
  }

  const validatedEnvelope = envelopeResult.data;
  const { event_id, event_type } = validatedEnvelope;

  const { inserted, id: billingEventId } = await persistBillingEventFirst({
    providerEventId: event_id,
    eventType: event_type,
    payload: validatedEnvelope,
  });

  // Events that are safe to re-process on retry (idempotent handlers). When Paddle retries,
  // the same event_id is sent again, so the insert above fails and we would skip processing.
  // For these types we still run the handler so retries actually update the DB.
  // Address/business events sync TenantBillingProfile when a Paddle admin updates address/business in the Paddle dashboard.
  const idempotentRetryEventTypes = ["address.created", "address.updated", "business.created", "business.updated"] as const;
  const isIdempotentRetry =
    !inserted &&
    idempotentRetryEventTypes.includes(event_type as (typeof idempotentRetryEventTypes)[number]);

  if (!inserted && !isIdempotentRetry) {
    logWebhookReplayDetected({
      provider: "paddle",
      eventId: event_id,
      eventType: event_type,
    });
    logWebhookReceived({
      eventType: event_type,
      providerEventId: event_id,
      result: "ignored",
    });
    if (billingEventId) {
      await updateBillingEventStatus(billingEventId, "skipped");
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const result = await handleWebhookEvent({
      rawBody,
      envelope: validatedEnvelope,
    });
    if (billingEventId) {
      await updateBillingEventStatus(billingEventId, "ok");
    }
    if (result.tenantMismatch) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid webhook payload schema") {
      logWebhookReceived({
        eventType: event_type,
        providerEventId: event_id,
        result: "validation_error",
      });
      if (billingEventId) {
        await updateBillingEventStatus(
          billingEventId,
          "validation_error",
          "Invalid webhook payload schema"
        );
      }
      return apiError("VALIDATION_ERROR", 400, "Invalid webhook payload schema");
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[billing/webhook] process_failure", {
      eventType: event_type,
      providerEventId: event_id,
      billingEventId,
      error: errorMessage,
    });
    logWebhookReceived({
      eventType: event_type,
      providerEventId: event_id,
      result: "process_failure",
    });
    if (billingEventId) {
      await updateBillingEventStatus(
        billingEventId,
        "failed",
        `${event_type}: ${errorMessage.slice(0, 200)}`
      );
    }
    // Return 200 intentionally to prevent Paddle retry storms.
    // The event is persisted in BillingEvent and can be replayed via
    // /api/internal/billing/replay-webhook-event when the root cause is fixed.
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
