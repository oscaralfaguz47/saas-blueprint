import { describe, expect, it } from "vitest";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/server/webhooks/secret-encryption";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("encryptWebhookSecret / decryptWebhookSecret", () => {
  it("round-trip preserves plaintext", () => {
    const raw = "whsec_" + "a".repeat(64);
    const enc = encryptWebhookSecret(raw, TEST_KEY);
    expect(decryptWebhookSecret(enc, TEST_KEY)).toBe(raw);
  });

  it("tampering with ciphertext fails authTag verification", () => {
    const enc = encryptWebhookSecret("whsec_hello", TEST_KEY);
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptWebhookSecret(tampered, TEST_KEY)).toThrow();
  });

  it("wrong key fails decryption", () => {
    const enc = encryptWebhookSecret("whsec_x", TEST_KEY);
    expect(() => decryptWebhookSecret(enc, OTHER_KEY)).toThrow();
  });

  it("different IVs yield different ciphertext for same plaintext", () => {
    const raw = "whsec_same";
    const a = encryptWebhookSecret(raw, TEST_KEY);
    const b = encryptWebhookSecret(raw, TEST_KEY);
    expect(a).not.toBe(b);
  });
});
