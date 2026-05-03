import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/server/db", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

describe("resetStaleWebhookDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reset count from RETURNING rows", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "d1" }, { id: "d2" }]);
    const { resetStaleWebhookDeliveries } = await import(
      "@/server/webhooks/worker-stale"
    );
    await expect(resetStaleWebhookDeliveries()).resolves.toEqual({ reset: 2 });
  });
});
