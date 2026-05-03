import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateWebhookSecret } from "@/server/webhooks/secrets";

describe("generateWebhookSecret", () => {
  it("returns whsec_ prefix, 64-char hex tail, sha256 hash of raw, and last-4 hint", () => {
    const { raw, hash, hint } = generateWebhookSecret();

    expect(raw.startsWith("whsec_")).toBe(true);
    const hexPart = raw.slice("whsec_".length);
    expect(hexPart).toMatch(/^[0-9a-f]{64}$/);
    expect(hint).toBe(hexPart.slice(-4));
    expect(hint).toHaveLength(4);

    const expectedHash = createHash("sha256").update(raw, "utf8").digest("hex");
    expect(hash).toBe(expectedHash);
    expect(hash).toHaveLength(64);
  });

  it("generates distinct secrets across calls", () => {
    const a = generateWebhookSecret().raw;
    const b = generateWebhookSecret().raw;
    expect(a).not.toBe(b);
  });
});
