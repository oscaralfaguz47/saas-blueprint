import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookEndpointStatus } from "@prisma/client";

import { processWebhookDeliveries } from "@/server/webhooks/worker";
import { encryptWebhookSecret } from "@/server/webhooks/secret-encryption";

const hoisted = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findFirst: vi.fn(),
  deliveryUpdate: vi.fn(),
  transaction: vi.fn(),
  resolveTenantPlan: vi.fn(),
  deliverWebhook: vi.fn(),
  txDeliveryUpdate: vi.fn(),
  txEndpointUpdate: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    $queryRaw: hoisted.queryRaw,
    webhookEndpoint: { findFirst: hoisted.findFirst },
    webhookDelivery: { update: hoisted.deliveryUpdate },
    $transaction: hoisted.transaction,
  },
}));

vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: hoisted.resolveTenantPlan,
}));

vi.mock("@/server/webhooks/deliver", () => ({
  deliverWebhook: hoisted.deliverWebhook,
}));

const key = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY!;
const baseRow = {
  id: "d1",
  tenantId: "t1",
  endpointId: "e1",
  eventId: "evt",
  eventName: "test.event",
  payloadVersion: "v1",
  payload: { ok: true },
  attemptCount: 1,
  maxAttempts: 8,
};

describe("processWebhookDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        webhookDelivery: { update: hoisted.txDeliveryUpdate },
        webhookEndpoint: { update: hoisted.txEndpointUpdate },
      });
    });
  });

  it("returns zeros when nothing is claimed", async () => {
    hoisted.queryRaw.mockResolvedValueOnce([]);
    const stats = await processWebhookDeliveries();
    expect(stats).toMatchObject({
      claimed: 0,
      succeeded: 0,
      scheduledRetry: 0,
      failedFinal: 0,
      precheckFailedFinal: 0,
      batchErrors: 0,
    });
  });

  it("precheck: missing endpoint updates delivery only (no transaction)", async () => {
    hoisted.queryRaw.mockResolvedValueOnce([baseRow]);
    hoisted.findFirst.mockResolvedValueOnce(null);
    const stats = await processWebhookDeliveries();
    expect(stats.precheckFailedFinal).toBe(1);
    expect(hoisted.transaction).not.toHaveBeenCalled();
    expect(hoisted.deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "FAILED_FINAL",
          lastErrorMessage: "endpoint_unavailable",
        }),
      })
    );
  });

  it("precheck: plan blocked does not call deliver", async () => {
    hoisted.queryRaw.mockResolvedValueOnce([baseRow]);
    hoisted.findFirst.mockResolvedValueOnce({
      id: "e1",
      tenantId: "t1",
      url: "https://example.com/hook",
      secretEncrypted: encryptWebhookSecret("sec", key),
      status: WebhookEndpointStatus.ACTIVE,
    });
    hoisted.resolveTenantPlan.mockResolvedValueOnce({
      features: { webhooks: false },
    });
    const stats = await processWebhookDeliveries();
    expect(stats.precheckFailedFinal).toBe(1);
    expect(hoisted.deliverWebhook).not.toHaveBeenCalled();
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it("receiver success resets endpoint counters in transaction", async () => {
    hoisted.queryRaw.mockResolvedValueOnce([baseRow]);
    hoisted.findFirst.mockResolvedValueOnce({
      id: "e1",
      tenantId: "t1",
      url: "https://example.com/hook",
      secretEncrypted: encryptWebhookSecret("sec", key),
      status: WebhookEndpointStatus.ACTIVE,
    });
    hoisted.resolveTenantPlan.mockResolvedValueOnce({
      features: { webhooks: true },
    });
    hoisted.deliverWebhook.mockResolvedValueOnce({
      status: "SUCCEEDED",
      httpStatus: 200,
      durationMs: 10,
    });
    const stats = await processWebhookDeliveries();
    expect(stats.succeeded).toBe(1);
    expect(hoisted.transaction).toHaveBeenCalledTimes(1);
    expect(hoisted.txDeliveryUpdate).toHaveBeenCalled();
    expect(hoisted.txEndpointUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: { consecutiveFailures: 0, lastSuccessAt: expect.any(Date) },
      })
    );
  });

  it("receiver 5xx schedules retry and increments failures", async () => {
    hoisted.queryRaw.mockResolvedValueOnce([baseRow]);
    hoisted.findFirst.mockResolvedValueOnce({
      id: "e1",
      tenantId: "t1",
      url: "https://example.com/hook",
      secretEncrypted: encryptWebhookSecret("sec", key),
      status: WebhookEndpointStatus.ACTIVE,
    });
    hoisted.resolveTenantPlan.mockResolvedValueOnce({
      features: { webhooks: true },
    });
    hoisted.deliverWebhook.mockResolvedValueOnce({
      status: "FAILED_RETRY",
      httpStatus: 503,
      durationMs: 5,
      errorMessage: "HTTP 503",
    });
    hoisted.txEndpointUpdate.mockResolvedValueOnce({
      consecutiveFailures: 1,
      lastSuccessAt: null,
    });
    const stats = await processWebhookDeliveries();
    expect(stats.scheduledRetry).toBe(1);
    expect(hoisted.txEndpointUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consecutiveFailures: { increment: 1 },
        }),
      })
    );
  });

  it("exhausted retries becomes FAILED_FINAL in same transaction path", async () => {
    const exhausted = { ...baseRow, attemptCount: 8, maxAttempts: 8 };
    hoisted.queryRaw.mockResolvedValueOnce([exhausted]);
    hoisted.findFirst.mockResolvedValueOnce({
      id: "e1",
      tenantId: "t1",
      url: "https://example.com/hook",
      secretEncrypted: encryptWebhookSecret("sec", key),
      status: WebhookEndpointStatus.ACTIVE,
    });
    hoisted.resolveTenantPlan.mockResolvedValueOnce({
      features: { webhooks: true },
    });
    hoisted.deliverWebhook.mockResolvedValueOnce({
      status: "FAILED_RETRY",
      httpStatus: 503,
      durationMs: 3,
    });
    hoisted.txEndpointUpdate.mockResolvedValueOnce({
      consecutiveFailures: 3,
      lastSuccessAt: null,
    });
    const stats = await processWebhookDeliveries();
    expect(stats.failedFinal).toBe(1);
    expect(stats.scheduledRetry).toBe(0);
    expect(hoisted.txDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED_FINAL" }),
      })
    );
  });

  it("isolates row errors so batch continues", async () => {
    hoisted.queryRaw.mockResolvedValueOnce([baseRow, { ...baseRow, id: "d2" }]);
    hoisted.findFirst
      .mockRejectedValueOnce(new Error("db read"))
      .mockResolvedValueOnce({
        id: "e1",
        tenantId: "t1",
        url: "https://example.com/hook",
        secretEncrypted: encryptWebhookSecret("sec", key),
        status: WebhookEndpointStatus.ACTIVE,
      });
    hoisted.resolveTenantPlan.mockResolvedValue({ features: { webhooks: true } });
    hoisted.deliverWebhook.mockResolvedValue({
      status: "SUCCEEDED",
      durationMs: 1,
    });
    const stats = await processWebhookDeliveries();
    expect(stats.batchErrors).toBe(1);
    expect(stats.succeeded).toBe(1);
  });
});
