import { NextResponse } from "next/server";
import { verifyPaddleWebhookSignature } from "@/server/billing/providers/paddle/verify-webhook-signature";
import {
  handleWebhookEvent,
  isEventAlreadyProcessed,
} from "@/server/billing/providers/paddle/handle-webhook-event";
import { paddleWebhookEnvelopeSchema } from "@/server/billing/providers/paddle/paddle-types";
import { logWebhookReceived } from "@/server/billing/billing-log";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const CONTENT_TYPE_JSON = "application/json";

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

  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== CONTENT_TYPE_JSON) {
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

  const { event_id } = envelopeResult.data;
  const alreadyProcessed = await isEventAlreadyProcessed(event_id);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const result = await handleWebhookEvent({ rawBody, envelope });
    if (result.tenantMismatch) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid webhook payload schema") {
      const envelope = envelopeResult?.data;
      logWebhookReceived({
        eventType: envelope?.event_type ?? "unknown",
        providerEventId: envelope?.event_id ?? "unknown",
        result: "validation_error",
      });
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid webhook payload schema" },
        { status: 400 }
      );
    }
    throw err;
  }
}
