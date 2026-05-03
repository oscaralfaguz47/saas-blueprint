import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { decryptWebhookSecret } from "@/server/webhooks/secret-encryption";
import { generateWebhookSecret } from "@/server/webhooks/secrets";

describe("generateWebhookSecret", () => {
  it("returns whsec_ prefix, encrypted blob, hint; round-trip decrypt matches raw", () => {
    const { raw, encrypted, hint } = generateWebhookSecret();

    expect(raw.startsWith("whsec_")).toBe(true);
    const hexPart = raw.slice("whsec_".length);
    expect(hexPart).toMatch(/^[0-9a-f]{64}$/);
    expect(hint).toBe(hexPart.slice(-4));
    expect(encrypted.length).toBeGreaterThan(0);

    const roundTrip = decryptWebhookSecret(encrypted, env.WEBHOOK_SECRET_ENCRYPTION_KEY);
    expect(roundTrip).toBe(raw);
  });

  it("generates distinct secrets across calls", () => {
    const a = generateWebhookSecret().raw;
    const b = generateWebhookSecret().raw;
    expect(a).not.toBe(b);
  });
});
