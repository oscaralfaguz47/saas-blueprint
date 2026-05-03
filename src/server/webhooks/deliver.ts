import "server-only";

import { buildWebhookSignatureHeader } from "@/lib/webhooks/sign";
import { validateWebhookUrl } from "./url-validation";

export type WebhookDeliveryResult = {
  status: "SUCCEEDED" | "FAILED_RETRY" | "FAILED_FINAL";
  httpStatus?: number;
  responseExcerpt?: string;
  errorMessage?: string;
  durationMs: number;
};

export type DeliverWebhookInput = {
  url: string;
  secret: string;
  /** Raw JSON body bytes as UTF-8 string — same octets POSTed and MAC input (epic 05 §6). */
  bodyUtf8: string;
  eventId: string;
  eventName: string;
  deliveryId: string;
  attempt: number;
  payloadVersion?: string;
  /** Test seam for deterministic timestamps */
  timestampUnixSec?: number;
};

function mapHttpResult(
  status: number,
  excerpt: string | undefined,
  durationMs: number
): WebhookDeliveryResult {
  const base = {
    httpStatus: status,
    responseExcerpt: excerpt,
    durationMs,
    errorMessage: `HTTP ${status}`,
  };

  if (status >= 200 && status < 300) {
    return {
      status: "SUCCEEDED",
      httpStatus: status,
      responseExcerpt: excerpt,
      durationMs,
    };
  }
  if (status >= 300 && status < 400) {
    return { status: "FAILED_FINAL", ...base };
  }
  if (status === 408 || status === 429) {
    return { status: "FAILED_RETRY", ...base };
  }
  if (status >= 400 && status < 500) {
    return { status: "FAILED_FINAL", ...base };
  }
  if (status >= 500) {
    return { status: "FAILED_RETRY", ...base };
  }
  return { status: "FAILED_RETRY", ...base };
}

/**
 * Validates URL (fresh DNS, dual-stack), signs body-only HMAC, POSTs with 9 §6 headers,
 * 5s timeout, redirect: manual (3xx → FAILED_FINAL).
 */
export async function deliverWebhook(
  input: DeliverWebhookInput
): Promise<WebhookDeliveryResult> {
  const start = Date.now();

  const validation = await validateWebhookUrl(input.url);
  if (!validation.ok) {
    return {
      status: "FAILED_FINAL",
      durationMs: Date.now() - start,
      errorMessage: validation.reason,
    };
  }

  const payloadVersion = input.payloadVersion ?? "v1";
  const ts =
    input.timestampUnixSec ?? Math.floor(Date.now() / 1000);
  const signatureHeader = buildWebhookSignatureHeader(
    input.bodyUtf8,
    input.secret
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Relitrue-Webhook/v1",
    "X-Relitrue-Event-Id": input.eventId,
    "X-Relitrue-Event-Name": input.eventName,
    "X-Relitrue-Payload-Version": payloadVersion,
    "X-Relitrue-Delivery-Id": input.deliveryId,
    "X-Relitrue-Delivery-Attempt": String(input.attempt),
    "X-Relitrue-Timestamp": String(ts),
    "X-Relitrue-Signature": signatureHeader,
  };

  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers,
      body: input.bodyUtf8,
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });

    let excerpt: string | undefined;
    try {
      excerpt = (await response.text()).slice(0, 1000);
    } catch {
      excerpt = undefined;
    }

    return mapHttpResult(response.status, excerpt, Date.now() - start);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "FAILED_RETRY",
      durationMs: Date.now() - start,
      errorMessage: msg,
    };
  }
}
