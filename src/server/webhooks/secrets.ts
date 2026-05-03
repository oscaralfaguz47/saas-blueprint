import "server-only";

import { createHash, randomBytes } from "node:crypto";

export type GeneratedWebhookSecret = {
  raw: string;
  hash: string;
  hint: string;
};

/**
 * Generates a prefixed webhook secret, SHA-256 hash for persistence, and a short hint.
 * Hash is of the full raw string including the `whsec_` prefix.
 */
export function generateWebhookSecret(): GeneratedWebhookSecret {
  const hex = randomBytes(32).toString("hex");
  const raw = `whsec_${hex}`;
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  const hint = hex.slice(-4);
  return { raw, hash, hint };
}
