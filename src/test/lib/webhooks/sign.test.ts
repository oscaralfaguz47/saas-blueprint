import { describe, expect, it } from "vitest";
import {
  buildWebhookSignatureHeader,
  verifyWebhookSignature,
} from "@/lib/webhooks/sign";
import { createHmac } from "node:crypto";

describe("buildWebhookSignatureHeader / verifyWebhookSignature", () => {
  const secret = "whsec_test_secret_value_minimum_length_ok";

  it("produces sha256=<lowercase hex> format", () => {
    const body = '{"hello":"world"}';
    const sig = buildWebhookSignatureHeader(body, secret);
    expect(sig.startsWith("sha256=")).toBe(true);
    const hex = sig.slice("sha256=".length);
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex).toBe(
      createHmac("sha256", secret).update(body, "utf8").digest("hex")
    );
  });

  it("MAC input is body only — timestamp is not mixed into HMAC", () => {
    const body = '{"x":1}';
    const sig = buildWebhookSignatureHeader(body, secret);
    const wrong = buildWebhookSignatureHeader("12345" + body, secret);
    expect(sig).not.toBe(wrong);
  });

  it("verify accepts valid signature (timing-safe path)", () => {
    const body = '{"a":true}';
    const sig = buildWebhookSignatureHeader(body, secret);
    expect(verifyWebhookSignature(body, secret, sig)).toBe(true);
  });

  it("verify rejects tampered body", () => {
    const body = '{"a":true}';
    const sig = buildWebhookSignatureHeader(body, secret);
    expect(verifyWebhookSignature(body + " ", secret, sig)).toBe(false);
  });

  it("verify rejects wrong signature length / tampered hex", () => {
    const body = "{}";
    const sig = buildWebhookSignatureHeader(body, secret);
    expect(verifyWebhookSignature(body, secret, sig.slice(0, -1))).toBe(false);
    expect(
      verifyWebhookSignature(body, secret, sig.replace(/a/g, "b"))
    ).toBe(false);
  });
});
