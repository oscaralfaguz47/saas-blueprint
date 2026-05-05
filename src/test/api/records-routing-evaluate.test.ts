import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalRoutingOutcome } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  userFindUnique: vi.fn(),
  hasTenantPermission: vi.fn(),
  recordFindFirst: vi.fn(),
  resolveTenantPlan: vi.fn(),
  $transaction: vi.fn(),
  evaluateAndAssign: vi.fn(),
  recordParticipantFindMany: vi.fn(),
  recordParticipantUpdateMany: vi.fn(),
  recordEventCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  recomputeApprovalStatus: vi.fn(),
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

vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: mocks.resolveTenantPlan,
}));

vi.mock("@/server/services/approval-routing-engine", () => ({
  evaluateAndAssign: mocks.evaluateAndAssign,
  APPROVAL_ROUTING_TRIGGER_EVENTS: {
    RECORD_CREATED: "RECORD_CREATED",
    ADMIN_MANUAL_REEVALUATION: "ADMIN_MANUAL_REEVALUATION",
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    record: { findFirst: mocks.recordFindFirst },
    recordParticipant: {
      findMany: mocks.recordParticipantFindMany,
      updateMany: mocks.recordParticipantUpdateMany,
    },
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/server/services/record-approval-status", () => ({
  recomputeApprovalStatus: mocks.recomputeApprovalStatus,
}));

import { POST } from "@/app/api/records/[id]/routing/evaluate/route";

const TENANT_ID = "cltenant000000000001";
const USER_ID = "clactor0000000000001";
const RECORD_ID = "clrecord000000000001";

const baseSession = {
  user: { id: USER_ID, sessionToken: "s" },
};

function setupAuthed() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    id: "mem-1",
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
  mocks.resolveTenantPlan.mockResolvedValue({
    features: { approvalRouting: { enabled: true } },
  });
}

function ctx() {
  return { params: Promise.resolve({ id: RECORD_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAuthed();
  mocks.recordFindFirst.mockResolvedValue({
    id: RECORD_ID,
    status: "OPEN",
    approvalStatus: "WAITING_FOR_APPROVAL",
  });
  mocks.recordParticipantFindMany.mockResolvedValue([
    { id: "p1", sequenceOrder: 1 },
  ]);
  mocks.recordParticipantUpdateMany.mockResolvedValue({ count: 1 });
  mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      recordParticipant: {
        findMany: mocks.recordParticipantFindMany,
        updateMany: mocks.recordParticipantUpdateMany,
      },
      recordEvent: { create: mocks.recordEventCreate },
      auditLog: { create: mocks.auditLogCreate },
    })
  );
  mocks.recordEventCreate.mockResolvedValue({});
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.recomputeApprovalStatus.mockResolvedValue({});
  mocks.evaluateAndAssign.mockResolvedValue({
    skipped: false,
    evaluationId: "eval-1",
    outcome: ApprovalRoutingOutcome.APPROVERS_ASSIGNED,
  });
});

describe("POST /api/records/[id]/routing/evaluate", () => {
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
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 without tenant.approval_routing.manage", async () => {
    mocks.hasTenantPermission.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when record missing (concealment)", async () => {
    mocks.recordFindFirst.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 INVALID_RECORD_STATUS when record not OPEN", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      id: RECORD_ID,
      status: "DRAFT",
      approvalStatus: "WAITING_FOR_APPROVAL",
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe("INVALID_RECORD_STATUS");
  });

  it("returns 409 APPROVAL_STATUS_TERMINAL when fully approved", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      id: RECORD_ID,
      status: "OPEN",
      approvalStatus: "FULLY_APPROVED",
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe("APPROVAL_STATUS_TERMINAL");
  });

  it("returns 403 UPGRADE_REQUIRED when approval routing disabled", async () => {
    mocks.resolveTenantPlan.mockResolvedValue({
      features: { approvalRouting: { enabled: false } },
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body (strict)", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "ok", extra: 1 }),
      }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("happy path: 200 with success envelope and engine outcome", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "reason" }),
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      success: boolean;
      data: { clearedCount: number; engineOutcome: string; evaluationId: string | null };
    };
    expect(j.success).toBe(true);
    expect(j.data.clearedCount).toBe(1);
    expect(j.data.engineOutcome).toBe(ApprovalRoutingOutcome.APPROVERS_ASSIGNED);
    expect(j.data.evaluationId).toBe("eval-1");
    expect(mocks.evaluateAndAssign).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEvent: "ADMIN_MANUAL_REEVALUATION",
        triggeredByUserId: USER_ID,
      })
    );
  });

  it("engine throws: 200 with warning and SKIPPED", async () => {
    mocks.evaluateAndAssign.mockRejectedValue(new Error("boom"));
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { warning?: string; engineOutcome: string; evaluationId: null };
    };
    expect(j.data.warning).toBeDefined();
    expect(j.data.engineOutcome).toBe("SKIPPED");
    expect(j.data.evaluationId).toBeNull();
  });

  it("engine skipped: SKIPPED and null evaluationId", async () => {
    mocks.evaluateAndAssign.mockResolvedValue({
      skipped: true,
      reason: "NOT_OPEN",
    });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { engineOutcome: string; evaluationId: null } };
    expect(j.data.engineOutcome).toBe("SKIPPED");
    expect(j.data.evaluationId).toBeNull();
  });
});
