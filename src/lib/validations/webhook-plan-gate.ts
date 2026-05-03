/**
 * Plan gate for outbound webhooks (E-001). Tier caps (e.g. max endpoints) belong in API/Zod (E-3+).
 */
export type WebhooksPlanGateResult =
  | { ok: true }
  | { ok: false; reason: "not_enabled" };

export function evaluateWebhooksPlanGate(features: {
  webhooks: boolean;
}): WebhooksPlanGateResult {
  if (!features.webhooks) return { ok: false, reason: "not_enabled" };
  return { ok: true };
}
