import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  userFindUnique: vi.fn(),
  tenantMembershipFindUnique: vi.fn(),
  recordFindFirst: vi.fn(),
  $transaction: vi.fn(),
  txRecordFindFirst: vi.fn(),
  txRecordUpdateMany: vi.fn(),
  txTenantMembershipUpdate: vi.fn(),
  txRecordEventCreate: vi.fn(),
  txAuditLogCreate: vi.fn(),
  evaluateAndAssign: vi.fn(),
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

vi.mock("@/server/services/finance-assignment-engine", () => ({
  evaluateAndAssign: mocks.evaluateAndAssign,
  TRIGGER_EVENTS: { RELEASE_BY_ASSIGNEE: "RELEASE_BY_ASSIGNEE" },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    tenantMembership: { findUnique: mocks.tenantMembershipFindUnique },
    record: { findFirst: mocks.recordFindFirst },
    $transaction: mocks.$transaction,
  },
}));

import { POST as POST_START } from "@/app/api/finance/queue/[recordId]/start/route";
import { POST as POST_COMPLETE } from "@/app/api/finance/queue/[recordId]/complete/route";
import { POST as POST_RELEASE } from "@/app/api/finance/queue/[recordId]/release/route";

const TENANT_ID = "clxxxxxxxxxxxxxxxxxxxxx4";
const USER_ID = "clxxxxxxxxxxxxxxxxxxxxx5";
const MEMBERSHIP_ID = "clxxxxxxxxxxxxxxxxxxxxx6";
const RECORD_ID = "clxxxxxxxxxxxxxxxxxxxxx1";

const baseSession = {
  user: { id: USER_ID, sessionToken: "s" },
};

function setupAuthed() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    id: MEMBERSHIP_ID,
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEMBERSHIP_ID, status: "ACTIVE" });
  mocks.recordFindFirst.mockResolvedValue({
    financeAssignedMembershipId: MEMBERSHIP_ID,
    financeStatus: FinanceStatus.ASSIGNED,
  });
}

function txMock() {
  mocks.$transaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      return fn({
        record: {
          findFirst: mocks.txRecordFindFirst,
          updateMany: mocks.txRecordUpdateMany,
        },
        tenantMembership: { update: mocks.txTenantMembershipUpdate },
        recordEvent: { create: mocks.txRecordEventCreate },
        auditLog: { create: mocks.txAuditLogCreate },
      });
    }
  );
}

function ctx() {
  return { params: Promise.resolve({ recordId: RECORD_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAuthed();
  txMock();
  mocks.txRecordFindFirst.mockResolvedValue({
    financeStatus: FinanceStatus.ASSIGNED,
    financeAssignedMembershipId: MEMBERSHIP_ID,
  });
  mocks.txRecordUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txTenantMembershipUpdate.mockResolvedValue({});
  mocks.txRecordEventCreate.mockResolvedValue({});
  mocks.txAuditLogCreate.mockResolvedValue({});
  mocks.evaluateAndAssign.mockResolvedValue({ outcome: "ASSIGNED", evaluationId: "e1" });
});

describe("POST /api/finance/queue/[recordId]/start", () => {
  it("happy path ASSIGNED → IN_PROGRESS", async () => {
    const res = await POST_START(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    expect(mocks.txRecordUpdateMany).toHaveBeenCalledWith({
      where: {
        id: RECORD_ID,
        tenantId: TENANT_ID,
        financeAssignedMembershipId: MEMBERSHIP_ID,
        financeStatus: "ASSIGNED",
      },
      data: { financeStatus: "IN_PROGRESS" },
    });
    expect(mocks.txTenantMembershipUpdate).not.toHaveBeenCalled();
    expect(mocks.txRecordEventCreate).toHaveBeenCalled();
    expect(mocks.txAuditLogCreate).toHaveBeenCalled();
  });

  it("returns 409 when updateMany count is 0", async () => {
    mocks.txRecordUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST_START(new Request("http://localhost"), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("returns 403 when not assignee", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeAssignedMembershipId: "other-mem",
      financeStatus: FinanceStatus.ASSIGNED,
    });
    const res = await POST_START(new Request("http://localhost"), ctx());
    expect(res.status).toBe(403);
  });

  it("returns 404 when record not in tenant", async () => {
    mocks.recordFindFirst.mockResolvedValue(null);
    const res = await POST_START(new Request("http://localhost"), ctx());
    expect(res.status).toBe(404);
  });

  it("regression: start must not invoke tenantMembership.update (counter)", async () => {
    mocks.txTenantMembershipUpdate.mockImplementation(() => {
      throw new Error("tenantMembership.update must not run on start");
    });
    const res = await POST_START(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
  });
});

describe("POST /api/finance/queue/[recordId]/complete", () => {
  it("happy path from ASSIGNED with decrement", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeAssignedMembershipId: MEMBERSHIP_ID,
      financeStatus: FinanceStatus.ASSIGNED,
    });
    const res = await POST_COMPLETE(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    expect(mocks.txTenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: MEMBERSHIP_ID, tenantId: TENANT_ID },
      data: { financeOpenAssignmentsCount: { decrement: 1 } },
    });
    expect(mocks.txRecordEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { fromStatus: FinanceStatus.ASSIGNED, skippedStart: true },
        }),
      })
    );
  });

  it("happy path from IN_PROGRESS", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeAssignedMembershipId: MEMBERSHIP_ID,
      financeStatus: FinanceStatus.IN_PROGRESS,
    });
    mocks.txRecordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.IN_PROGRESS,
      financeAssignedMembershipId: MEMBERSHIP_ID,
    });
    const res = await POST_COMPLETE(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    expect(mocks.txRecordEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { fromStatus: FinanceStatus.IN_PROGRESS, skippedStart: false },
        }),
      })
    );
  });

  it("returns 409 when pre-read status is COMPLETED", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeAssignedMembershipId: MEMBERSHIP_ID,
      financeStatus: FinanceStatus.COMPLETED,
    });
    const res = await POST_COMPLETE(new Request("http://localhost"), ctx());
    expect(res.status).toBe(409);
  });

  it("returns 409 when updateMany fails inside tx", async () => {
    mocks.txRecordUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST_COMPLETE(new Request("http://localhost"), ctx());
    expect(res.status).toBe(409);
  });
});

describe("POST /api/finance/queue/[recordId]/release", () => {
  it("clears assignment and decrements; calls evaluateAndAssign after tx", async () => {
    const order: string[] = [];
    mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      order.push("tx-start");
      const out = await fn({
        record: {
          findFirst: mocks.txRecordFindFirst,
          updateMany: mocks.txRecordUpdateMany,
        },
        tenantMembership: { update: mocks.txTenantMembershipUpdate },
        recordEvent: { create: mocks.txRecordEventCreate },
        auditLog: { create: mocks.txAuditLogCreate },
      });
      order.push("tx-end");
      return out;
    });
    mocks.evaluateAndAssign.mockImplementation(async () => {
      order.push("engine");
      return { outcome: "ASSIGNED", evaluationId: "e1" };
    });

    const res = await POST_RELEASE(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reEvaluationTriggered).toBe(true);
    expect(order).toEqual(["tx-start", "tx-end", "engine"]);

    expect(mocks.txRecordUpdateMany).toHaveBeenCalledWith({
      where: {
        id: RECORD_ID,
        tenantId: TENANT_ID,
        financeAssignedMembershipId: MEMBERSHIP_ID,
        financeStatus: { in: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS] },
      },
      data: {
        financeStatus: FinanceStatus.PENDING_ASSIGNMENT,
        financeAssignedMembershipId: null,
        financeAssignedAt: null,
        financeAssignedByRuleId: null,
      },
    });
    expect(mocks.evaluateAndAssign).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      recordId: RECORD_ID,
      triggerEvent: "RELEASE_BY_ASSIGNEE",
      triggeredByUserId: USER_ID,
    });
  });

  it("engine failure does not fail request", async () => {
    mocks.evaluateAndAssign.mockRejectedValue(new Error("boom"));
    const res = await POST_RELEASE(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reEvaluationTriggered).toBe(false);
  });
});
