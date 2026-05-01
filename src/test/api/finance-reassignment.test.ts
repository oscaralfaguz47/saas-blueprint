import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationOutcome, FinanceStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  userFindUnique: vi.fn(),
  hasTenantPermission: vi.fn(),
  recordFindFirst: vi.fn(),
  tenantMembershipFindFirst: vi.fn(),
  $transaction: vi.fn(),
  evaluateAndAssign: vi.fn(),
  createNotification: vi.fn(),
  txRecordUpdateMany: vi.fn(),
  txTenantMembershipUpdate: vi.fn(),
  txEvalCreate: vi.fn(),
  txRecordEventCreate: vi.fn(),
  txAuditLogCreate: vi.fn(),
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

vi.mock("@/server/services/finance-assignment-engine", () => ({
  evaluateAndAssign: mocks.evaluateAndAssign,
  TRIGGER_EVENTS: { ADMIN_MANUAL_REEVALUATION: "ADMIN_MANUAL_REEVALUATION" },
}));

vi.mock("@/server/services/notifications", () => ({
  createNotification: mocks.createNotification,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    record: { findFirst: mocks.recordFindFirst },
    tenantMembership: { findFirst: mocks.tenantMembershipFindFirst },
    $transaction: mocks.$transaction,
  },
}));

import { POST } from "@/app/api/finance/assignments/[recordId]/reassign/route";

const TENANT_ID = "clxxxxxxxxxxxxxxxxxxxxx4";
const USER_ID = "clxxxxxxxxxxxxxxxxxxxxx5";
const RECORD_ID = "clxxxxxxxxxxxxxxxxxxxxx1";
const OLD_MEM = "clxxxxxxxxxxxxxxxxxxxxx6";
const NEW_MEM = "clxxxxxxxxxxxxxxxxxxxxx7";
const TARGET_USER = "clxxxxxxxxxxxxxxxxxxxxx8";

const baseSession = {
  user: { id: USER_ID, sessionToken: "s" },
};

function setupAuthed() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    id: "mem-admin",
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
}

function txMock() {
  mocks.$transaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      return fn({
        record: { updateMany: mocks.txRecordUpdateMany },
        tenantMembership: { update: mocks.txTenantMembershipUpdate },
        financeAssignmentEvaluation: { create: mocks.txEvalCreate },
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
  mocks.recordFindFirst.mockResolvedValue({
    financeStatus: FinanceStatus.ASSIGNED,
    financeAssignedMembershipId: OLD_MEM,
    title: "My record",
  });
  mocks.tenantMembershipFindFirst.mockResolvedValue({
    tenantId: TENANT_ID,
    status: "ACTIVE",
    financeResponsibility: "PROCESS",
    userId: TARGET_USER,
  });
  txMock();
  mocks.txRecordUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txTenantMembershipUpdate.mockResolvedValue({});
  mocks.txEvalCreate.mockResolvedValue({ id: "eval-manual-1" });
  mocks.txRecordEventCreate.mockResolvedValue({});
  mocks.txAuditLogCreate.mockResolvedValue({});
  mocks.evaluateAndAssign.mockResolvedValue({
    outcome: EvaluationOutcome.ASSIGNED,
    evaluationId: "eval-eng-1",
    assignedMembershipId: NEW_MEM,
    matchedRuleId: "rule-1",
  });
  mocks.createNotification.mockResolvedValue({
    notificationId: "n1",
    channelsDelivered: ["IN_APP"],
    channelsFailed: [],
  });
});

describe("POST /api/finance/assignments/[recordId]/reassign", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      ctx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when platform blocked", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      ctx()
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 without tenant.financial_config.manage", async () => {
    mocks.hasTenantPermission.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      ctx()
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for unknown JSON keys (strict)", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM, extra: 1 }),
      }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when record missing (concealment)", async () => {
    mocks.recordFindFirst.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM }),
      }),
      ctx()
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when record financeStatus is COMPLETED", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.COMPLETED,
      financeAssignedMembershipId: OLD_MEM,
      title: "T",
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM }),
      }),
      ctx()
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("Direct: 409 NOOP_REASSIGNMENT when target equals current assignee", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.ASSIGNED,
      financeAssignedMembershipId: NEW_MEM,
      title: "T",
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM }),
      }),
      ctx()
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("NOOP_REASSIGNMENT");
  });

  it("Direct: happy path creates MANUAL_REASSIGN snapshot and swaps counters", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM, note: "please take" }),
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.mode).toBe("DIRECT");
    expect(json.data.evaluationId).toBe("eval-manual-1");

    expect(mocks.txRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECORD_ID, tenantId: TENANT_ID, financeAssignedMembershipId: OLD_MEM },
      })
    );
    expect(mocks.txTenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: OLD_MEM, tenantId: TENANT_ID },
      data: { financeOpenAssignmentsCount: { decrement: 1 } },
    });
    expect(mocks.txTenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: NEW_MEM, tenantId: TENANT_ID },
      data: { financeOpenAssignmentsCount: { increment: 1 } },
    });
    expect(mocks.txEvalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectionStrategy: "MANUAL_REASSIGN",
          triggeredByEvent: "ADMIN_MANUAL_REASSIGN",
          outcome: EvaluationOutcome.ASSIGNED,
        }),
      })
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TARGET_USER,
        type: "RECORD_FINANCE_ASSIGNED",
      })
    );
  });

  it("Direct: unassigned record only increments new counter", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.PENDING_ASSIGNMENT,
      financeAssignedMembershipId: null,
      title: "T",
    });
    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM }),
      }),
      ctx()
    );
    expect(mocks.txRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECORD_ID, tenantId: TENANT_ID, financeAssignedMembershipId: null },
      })
    );
    const decrementCalls = mocks.txTenantMembershipUpdate.mock.calls.filter(
      (c) => "decrement" in (c[0]?.data as object)
    );
    expect(decrementCalls.length).toBe(0);
    expect(mocks.txTenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: NEW_MEM, tenantId: TENANT_ID },
      data: { financeOpenAssignmentsCount: { increment: 1 } },
    });
  });

  it("Evaluation: clear tx then evaluateAndAssign after commit", async () => {
    const order: string[] = [];
    mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      order.push("tx");
      return fn({
        record: { updateMany: mocks.txRecordUpdateMany },
        tenantMembership: { update: mocks.txTenantMembershipUpdate },
        financeAssignmentEvaluation: { create: mocks.txEvalCreate },
        recordEvent: { create: mocks.txRecordEventCreate },
        auditLog: { create: mocks.txAuditLogCreate },
      });
    });
    mocks.evaluateAndAssign.mockImplementation(async () => {
      order.push("engine");
      return {
        outcome: EvaluationOutcome.NO_RULE_MATCHED,
        evaluationId: "e2",
      };
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    expect(order).toEqual(["tx", "engine"]);
    expect(mocks.evaluateAndAssign).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      recordId: RECORD_ID,
      triggerEvent: "ADMIN_MANUAL_REEVALUATION",
      triggeredByUserId: USER_ID,
    });
    const body = await res.json();
    expect(body.data.engineOutcome).toBe(EvaluationOutcome.NO_RULE_MATCHED);
  });

  it("Evaluation: skips clear when unassigned; engine only", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.NOT_REQUIRED,
      financeAssignedMembershipId: null,
      title: "T",
    });
    const order: string[] = [];
    mocks.$transaction.mockImplementation(async () => {
      order.push("tx-should-not-run");
    });
    mocks.evaluateAndAssign.mockImplementation(async () => {
      order.push("engine");
      return { outcome: EvaluationOutcome.NO_RULE_MATCHED, evaluationId: "e3" };
    });

    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx()
    );
    expect(order).toEqual(["engine"]);
  });

  it("Evaluation: engine failure returns 200 with ENGINE_ERROR", async () => {
    mocks.evaluateAndAssign.mockRejectedValue(new Error("boom"));
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.engineOutcome).toBe("ENGINE_ERROR");
    expect(body.data.engineEvaluationId).toBeNull();
  });

  it("Direct: second tenantMembership.update throws — transaction fails (atomic rollback)", async () => {
    let updateCount = 0;
    mocks.txTenantMembershipUpdate.mockImplementation(
      async (args: { data: { financeOpenAssignmentsCount?: { increment?: number; decrement?: number } } }) => {
        updateCount += 1;
        const c = args.data.financeOpenAssignmentsCount;
        if (c && "increment" in c) {
          throw new Error("increment_failed");
        }
        return {};
      }
    );

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMembershipId: NEW_MEM }),
      }),
      ctx()
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(updateCount).toBeGreaterThanOrEqual(2);
  });
});
