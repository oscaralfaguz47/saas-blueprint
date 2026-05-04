import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMocks = vi.hoisted(() => ({
  enqueueWebhookEvent: vi.fn(),
}));

vi.mock("@/server/webhooks/enqueue", () => ({
  enqueueWebhookEvent: enqueueMocks.enqueueWebhookEvent,
}));

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  checkRateLimit: vi.fn(),
  userFindUnique: vi.fn(),
  $transaction: vi.fn(),
  tryConsumeMeter: vi.fn(),
  checkMeterLimit: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/server/auth-options", () => ({
  authOptions: {},
}));

vi.mock("@/server/require-full-session", () => ({
  requireFullSession: mocks.requireFullSession,
}));

vi.mock("@/server/services/tenancy", () => ({
  getDefaultTenantForUser: mocks.getDefaultTenantForUser,
}));

vi.mock("@/server/security/tenant-authorization", () => ({
  hasTenantPermission: mocks.hasTenantPermission,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/server/billing/try-consume-meter", () => ({
  checkMeterLimit: mocks.checkMeterLimit,
  tryConsumeMeter: mocks.tryConsumeMeter,
}));

vi.mock("@/server/services/approval-routing-engine", () => ({
  APPROVAL_ROUTING_TRIGGER_EVENTS: { RECORD_CREATED: "RECORD_CREATED" },
  evaluateAndAssign: vi.fn().mockResolvedValue({ skipped: true, reason: "NOT_OPEN" }),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.$transaction,
  },
}));

import { POST as POST_RECORDS } from "@/app/api/records/route";

function buildPost(body: unknown) {
  return new Request("http://localhost/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/records webhook enqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueMocks.enqueueWebhookEvent.mockResolvedValue({
      enqueued: 1,
      skipped: 0,
      planBlocked: false,
    });
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "u1",
        authLevel: "FULL",
        totpEnabled: false,
        mfaVerified: true,
      },
    });
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.getDefaultTenantForUser.mockResolvedValue({ tenant: { id: "t1" } });
    mocks.hasTenantPermission.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.checkMeterLimit.mockResolvedValue(undefined);
    mocks.tryConsumeMeter.mockResolvedValue(undefined);

    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        record: {
          create: vi.fn().mockResolvedValue({
            id: "r_new",
            title: "Hello",
            type: "BUDGET",
            status: "OPEN",
            createdAt,
            priority: "MEDIUM",
            requestedAmount: null,
            currencyCode: null,
            neededByDate: null,
          }),
          count: vi.fn().mockResolvedValue(1),
          update: vi.fn().mockResolvedValue({
            id: "r_new",
            title: "Hello",
            type: "BUDGET",
            status: "OPEN",
            createdAt,
            priority: "MEDIUM",
            requestedAmount: null,
            currencyCode: null,
            neededByDate: null,
            recordKey: "REQ-2026-000001",
          }),
        },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
  });

  it("calls enqueueWebhookEvent after successful create", async () => {
    const res = await POST_RECORDS(
      buildPost({
        title: "Hello",
        type: "BUDGET",
        visibility: "WORKSPACE",
        isSensitive: false,
      })
    );
    expect(res.status).toBe(201);
    expect(enqueueMocks.enqueueWebhookEvent).toHaveBeenCalledTimes(1);
    expect(enqueueMocks.enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        eventName: "record.created",
        recordId: "r_new",
      })
    );
  });
});
