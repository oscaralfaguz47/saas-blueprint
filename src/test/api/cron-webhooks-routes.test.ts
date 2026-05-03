import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processWebhookDeliveries: vi.fn(),
  resetStaleWebhookDeliveries: vi.fn(),
}));

vi.mock("@/server/webhooks/worker", () => ({
  processWebhookDeliveries: mocks.processWebhookDeliveries,
}));

vi.mock("@/server/webhooks/worker-stale", () => ({
  resetStaleWebhookDeliveries: mocks.resetStaleWebhookDeliveries,
}));

describe("cron webhook routes", () => {
  it("webhooks: 401 without bearer secret", async () => {
    mocks.processWebhookDeliveries.mockReset();
    const { GET } = await import("@/app/api/internal/cron/webhooks/route");
    const res = await GET(new Request("http://localhost/api/internal/cron/webhooks"));
    expect(res.status).toBe(401);
    expect(mocks.processWebhookDeliveries).not.toHaveBeenCalled();
  });

  it("webhooks: 200 aggregated stats with auth", async () => {
    mocks.processWebhookDeliveries.mockResolvedValueOnce({
      claimed: 2,
      succeeded: 1,
      scheduledRetry: 1,
      failedFinal: 0,
      precheckFailedFinal: 0,
      batchErrors: 0,
    });
    const { GET } = await import("@/app/api/internal/cron/webhooks/route");
    const res = await GET(
      new Request("http://localhost/api/internal/cron/webhooks", {
        headers: { authorization: "Bearer vitest-cron-secret" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(
      expect.objectContaining({
        claimed: 2,
        succeeded: 1,
        scheduledRetry: 1,
      })
    );
  });

  it("webhooks-stale: 200 with reset count", async () => {
    mocks.resetStaleWebhookDeliveries.mockResolvedValueOnce({ reset: 3 });
    const { GET } = await import("@/app/api/internal/cron/webhooks-stale/route");
    const res = await GET(
      new Request("http://localhost/api/internal/cron/webhooks-stale", {
        headers: { authorization: "Bearer vitest-cron-secret" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ reset: 3 });
  });
});
