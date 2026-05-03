import { createHmac, timingSafeEqual } from "node:crypto";

const SIG_PREFIX = "sha256=" as const;

/**
 * HMAC-SHA256 over the raw JSON body string only (epic 05 §6). Timestamp is not in the MAC input.
 * @returns X-Relitrue-Signature value, e.g. "sha256=abcdef..." (lowercase hex)
 */
export function buildWebhookSignatureHeader(
  bodyUtf8: string,
  secret: string
): string {
  const hex = createHmac("sha256", secret)
    .update(bodyUtf8, "utf8")
    .digest("hex");
  return `${SIG_PREFIX}${hex}`;
}

/**
 * Verify `X-Relitrue-Signature` from a receiver (tests + future docs). Timing-safe.
 */
export function verifyWebhookSignature(
  bodyUtf8: string,
  secret: string,
  signatureHeader: string
): boolean {
  const expected = buildWebhookSignatureHeader(bodyUtf8, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
