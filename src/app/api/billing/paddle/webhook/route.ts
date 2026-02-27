import { NextResponse } from "next/server";
import { verifyPaddleWebhookSignature } from "@/server/billing/providers/paddle/verify-webhook-signature";
import { handleWebhookEvent } from "@/server/billing/providers/paddle/handle-webhook-event";
import { paddleWebhookEnvelopeSchema } from "@/server/billing/providers/paddle/paddle-types";
import { logWebhookReceived } from "@/server/billing/billing-log";
import { persistBillingEventFirst } from "@/server/billing/webhooks/persist-first";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
/** Paddle may send application/json or application/json; charset=utf-8 (with or without space). */
function isJsonContentType(header: string | null): boolean {
  const v = header?.trim().toLowerCase() ?? "";
  return v === "application/json" || v.startsWith("application/json;");
}

export async function GET() {
  return NextResponse.json(
    { error: "METHOD_NOT_ALLOWED", message: "POST only" },
    { status: 405 }
  );
}

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { error: "METHOD_NOT_ALLOWED", message: "POST only" },
      { status: 405 }
    );
  }

  if (!isJsonContentType(req.headers.get("content-type"))) {
    return NextResponse.json(
      { error: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  let rawBody: string;
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!Number.isFinite(len) || len > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
          { status: 413 }
        );
      }
    }
    rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
        { status: 413 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Invalid request body" },
      { status: 400 }
    );
  }

  const signatureHeader = req.headers.get("paddle-signature");
  try {
    verifyPaddleWebhookSignature(rawBody, signatureHeader);
  } catch {
    logWebhookReceived({
      eventType: "unknown",
      providerEventId: "unknown",
      result: "signature_invalid",
    });
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid JSON" },
      { status: 400 }
    );
  }

  const envelopeResult = paddleWebhookEnvelopeSchema.safeParse(envelope);
  if (!envelopeResult.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid webhook payload schema" },
      { status: 400 }
    );
  }

  const validatedEnvelope = envelopeResult.data;
  const { event_id, event_type } = validatedEnvelope;

  const inserted = await persistBillingEventFirst({
    providerEventId: event_id,
    eventType: event_type,
    payload: validatedEnvelope,
  });

  // Events that are safe to re-process on retry (idempotent handlers). When Paddle retries,
  // the same event_id is sent again, so the insert above fails and we would skip processing.
  // For these types we still run the handler so retries actually update the DB.
  const idempotentRetryEventTypes = ["address.updated", "business.created", "business.updated"] as const;
  const isIdempotentRetry = !inserted && idempotentRetryEventTypes.includes(event_type as (typeof idempotentRetryEventTypes)[number]);

  if (!inserted && !isIdempotentRetry) {
    logWebhookReceived({
      eventType: event_type,
      providerEventId: event_id,
      result: "ignored",
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const result = await handleWebhookEvent({
      rawBody,
      envelope: validatedEnvelope,
    });
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
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid webhook payload schema" },
        { status: 400 }
      );
    }
    logWebhookReceived({
      eventType: event_type,
      providerEventId: event_id,
      result: "process_failure",
    });
    // Return 200 to prevent Paddle retry storms; event is logged for investigation
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
