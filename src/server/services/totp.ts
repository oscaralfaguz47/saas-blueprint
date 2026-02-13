import "server-only";

import { createHmac, randomBytes } from "node:crypto";

const TOTP_DIGITS = 6;
const TOTP_PERIOD_SEC = 30;

/**
 * Base32 alphabet (RFC 4648); no padding.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

/**
 * Generate a new TOTP secret (32 bytes, base32-encoded for manual entry).
 */
export function generateTotpSecret(): { raw: string; base32: string } {
  const raw = randomBytes(20);
  const base32 = base32Encode(raw);
  return { raw: raw.toString("base64"), base32 };
}

/**
 * Convert raw secret (base64) to base32 for otpauth URI (e.g. when resuming pending setup).
 */
export function rawSecretToBase32(rawBase64: string): string {
  const buf = Buffer.from(rawBase64, "base64");
  return base32Encode(buf);
}

/**
 * Get current time step (floor(now / 30)).
 */
function getTimeStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_PERIOD_SEC);
}

/**
 * Generate TOTP code for a given time step (RFC 6238).
 * Secret is raw (decrypted) secret.
 */
function generateTotpForStep(secretRaw: string, step: number): string {
  const key = Buffer.from(secretRaw, "base64");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step), 0);
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[19]! & 0x0f;
  const code = ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const str = (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
  return str;
}

/**
 * Verify a 6-digit TOTP code. Allows current and adjacent steps (1 step either side) for clock drift.
 */
export function verifyTotpCode(secretRaw: string, code: string): boolean {
  const step = getTimeStep();
  for (let d = -1; d <= 1; d++) {
    const expected = generateTotpForStep(secretRaw, step + d);
    if (expected === code) return true;
  }
  return false;
}

/**
 * Build otpauth URI for QR code (e.g. Google Authenticator).
 */
export function buildOtpauthUri(params: {
  secretBase32: string;
  accountName: string;
  issuer?: string;
}): string {
  const encodedAccount = encodeURIComponent(params.accountName);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
    algorithm: "SHA1",
  });
  if (params.issuer) query.set("issuer", params.issuer);
  return `otpauth://totp/${encodedAccount}?${query.toString()}`;
}

const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate one backup code (readable, no ambiguous chars).
 */
function generateOneBackupCode(): string {
  let s = "";
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    s += BACKUP_CODE_CHARS[bytes[i]! % BACKUP_CODE_CHARS.length];
  }
  return s;
}

/**
 * Generate a set of single-use backup codes.
 */
export function generateBackupCodes(): string[] {
  const set = new Set<string>();
  while (set.size < BACKUP_CODE_COUNT) {
    set.add(generateOneBackupCode());
  }
  return Array.from(set);
}

/**
 * Hash a backup code for storage (single-use; no plaintext stored).
 */
export function hashBackupCode(code: string, userId: string): string {
  return createHmac("sha256", userId)
    .update(code.trim().toUpperCase())
    .digest("hex");
}
