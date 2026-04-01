import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

const PADDLE_SIGNATURE_HEADER = "paddle-signature";
const REPLAY_TOLERANCE_SEC = 5 * 60; // ±5 minutes

function getWebhookSecrets(): string[] {
  const current = env.PADDLE_WEBHOOK_SECRET_CURRENT ?? env.PADDLE_WEBHOOK_SECRET;
  const previous = env.PADDLE_WEBHOOK_SECRET_PREVIOUS;
  const out: string[] = [];
  if (current) out.push(current);
  if (previous && previous !== current) out.push(previous);
  return out;
}

/** Whether webhook secret is configured (for startup/diagnostic logs; never log the secret). */
export function isWebhookSecretConfigured(): boolean {
  return getWebhookSecrets().length > 0;
}

/**
 * Parse Paddle-Signature header: "ts=1671552777;h1=hex..."
 * Returns { ts, h1 } or null if invalid.
 */
function parsePaddleSignature(header: string | null): { ts: number; h1: string } | null {
  if (!header || typeof header !== "string") return null;
  const parts = header.split(";").map((p) => p.trim());
  let ts: number | null = null;
  let h1: string | null = null;
  for (const p of parts) {
    const [key, value] = p.split("=").map((s) => s.trim());
    if (key === "ts") ts = parseInt(value, 10);
    if (key === "h1") h1 = value;
  }
  if (ts == null || !Number.isFinite(ts) || !h1 || h1.length === 0) return null;
  return { ts, h1 };
}

/**
 * Compute HMAC-SHA256 of payload with secret; return hex string.
 */
function computeHmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Verify Paddle webhook signature using raw body.
 * Supports secret rotation: tries PADDLE_WEBHOOK_SECRET_CURRENT then PADDLE_WEBHOOK_SECRET_PREVIOUS.
 * Enforces replay window: ts must be within ±REPLAY_TOLERANCE_SEC of now.
 * @param rawBody - Raw request body (string or Buffer); must not be parsed/modified.
 * @param signatureHeader - Value of Paddle-Signature header.
 * @throws Error if verification fails or replay window exceeded.
 */
export function verifyPaddleWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null
): void {
  const secrets = getWebhookSecrets();
  if (secrets.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("[billing]", {
      event: "billing.webhook.secret_not_configured",
      timestamp: new Date().toISOString(),
    });
    throw new Error("Paddle webhook secret not configured");
  }

  const parsed = parsePaddleSignature(signatureHeader);
  if (!parsed) {
    throw new Error("Invalid Paddle-Signature header");
  }

  const bodyString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedPayload = `${parsed.ts}:${bodyString}`;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(parsed.ts - nowSec) > REPLAY_TOLERANCE_SEC) {
    throw new Error("Webhook timestamp outside allowed window");
  }

  let verified = false;
  for (const secret of secrets) {
    const expected = computeHmacHex(secret, signedPayload);
    if (
      parsed.h1.length === expected.length &&
      timingSafeEqual(Buffer.from(parsed.h1, "hex"), Buffer.from(expected, "hex"))
    ) {
      verified = true;
      break;
    }
  }
  if (!verified) {
    throw new Error("Webhook signature verification failed");
  }
}
