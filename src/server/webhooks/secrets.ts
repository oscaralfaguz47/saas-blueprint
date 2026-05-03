import "server-only";

import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { encryptWebhookSecret } from "./secret-encryption";

export type GeneratedWebhookSecret = {
  raw: string;
  encrypted: string;
  hint: string;
};

/**
 * Generates a prefixed webhook secret, encrypts for persistence, and a short hint.
 * Raw format: whsec_<64 hex chars>; hint = last 4 of hex segment.
 */
export function generateWebhookSecret(): GeneratedWebhookSecret {
  const hex = randomBytes(32).toString("hex");
  const raw = `whsec_${hex}`;
  const encrypted = encryptWebhookSecret(raw, env.WEBHOOK_SECRET_ENCRYPTION_KEY);
  const hint = hex.slice(-4);
  return { raw, encrypted, hint };
}
