import { describe, expect, it } from "vitest";
import { evaluateWebhooksPlanGate } from "@/lib/validations/webhook-plan-gate";

describe("evaluateWebhooksPlanGate", () => {
  it("returns ok when webhooks feature enabled", () => {
    expect(evaluateWebhooksPlanGate({ webhooks: true })).toEqual({ ok: true });
  });

  it("returns not_enabled when webhooks feature disabled", () => {
    expect(evaluateWebhooksPlanGate({ webhooks: false })).toEqual({
      ok: false,
      reason: "not_enabled",
    });
  });
});
