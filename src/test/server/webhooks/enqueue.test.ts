import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
const mocks = vi.hoisted(() => ({
  resolveTenantPlan: vi.fn(),
  tenantFindFirst: vi.fn(),
  endpointFindMany: vi.fn(),
  deliveryCreate: vi.fn(),
}));

vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: mocks.resolveTenantPlan,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    tenant: { findFirst: mocks.tenantFindFirst },
    webhookEndpoint: { findMany: mocks.endpointFindMany },
    webhookDelivery: { create: mocks.deliveryCreate },
  },
}));

import {
  buildEventId,
  enqueueWebhookEvent,
} from "@/server/webhooks/enqueue";

describe("buildEventId", () => {
  it("returns stable candidate under 64 chars", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    const ts = Math.floor(at.getTime() / 1000);
    const id = buildEventId("record.created", "clrec1234567890123456789", at);
    expect(id).toBe(`record.created:clrec1234567890123456789:${ts}`);
  });

  it("truncates with sha256 when candidate exceeds 64", () => {
    const at = new Date(0);
    const longName = "a".repeat(50) + ".x";
    const id = buildEventId(longName, "cuid", at);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});

describe("enqueueWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantFindFirst.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "Acme",
    });
    mocks.endpointFindMany.mockResolvedValue([
      {
        id: "ep1",
        subscribedEvents: ["record.created"],
      },
    ]);
    mocks.deliveryCreate.mockResolvedValue({ id: "d1" });
    mocks.resolveTenantPlan.mockResolvedValue({
      features: { webhooks: true },
    });
  });

  it("returns planBlocked when gate fails", async () => {
    mocks.resolveTenantPlan.mockResolvedValueOnce({
      features: { webhooks: false },
    });
    const out = await enqueueWebhookEvent({
      tenantId: "t1",
      eventName: "record.created",
      recordId: "r1",
      occurredAt: new Date(),
      data: { id: "r1" },
    });
    expect(out).toEqual({ enqueued: 0, skipped: 0, planBlocked: true });
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
  });

  it("creates delivery per subscribed endpoint", async () => {
    mocks.endpointFindMany.mockResolvedValueOnce([
      { id: "ep1", subscribedEvents: ["record.created"] },
      { id: "ep2", subscribedEvents: ["record.created", "record.closed"] },
      { id: "ep3", subscribedEvents: ["record.closed"] },
    ]);
    const at = new Date("2026-06-01T12:00:00.000Z");
    const out = await enqueueWebhookEvent({
      tenantId: "t1",
      eventName: "record.created",
      recordId: "r1",
      occurredAt: at,
      data: { id: "r1", name: "X" },
    });
    expect(out.enqueued).toBe(2);
    expect(out.planBlocked).toBe(false);
    expect(mocks.deliveryCreate).toHaveBeenCalledTimes(2);
  });

  it("counts P2002 as skipped and continues", async () => {
    mocks.endpointFindMany.mockResolvedValueOnce([
      { id: "ep1", subscribedEvents: ["record.created"] },
      { id: "ep2", subscribedEvents: ["record.created"] },
    ]);
    mocks.deliveryCreate
      .mockRejectedValueOnce(
        new PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "x",
          meta: {},
        })
      )
      .mockResolvedValueOnce({ id: "d2" });

    const out = await enqueueWebhookEvent({
      tenantId: "t1",
      eventName: "record.created",
      recordId: "r1",
      occurredAt: new Date(),
      data: {},
    });
    expect(out.enqueued).toBe(1);
    expect(out.skipped).toBe(1);
  });

  it("never throws on unexpected errors", async () => {
    mocks.resolveTenantPlan.mockRejectedValueOnce(new Error("db down"));
    await expect(
      enqueueWebhookEvent({
        tenantId: "t1",
        eventName: "record.created",
        recordId: "r1",
        occurredAt: new Date(),
        data: {},
      })
    ).resolves.toEqual({
      enqueued: 0,
      skipped: 0,
      planBlocked: false,
    });
  });
});
