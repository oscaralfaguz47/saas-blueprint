import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanFeatures } from "@/server/billing/provider-types";
import {
  approvalRoutingRuleApproverSchema,
  approvalRoutingRuleCreateSchema,
} from "@/lib/validations/approval-routing-rule";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  resolveTenantPlan: vi.fn(),
  approvalRoutingRuleCount: vi.fn(),
  approvalRoutingRuleFindMany: vi.fn(),
  approvalRoutingRuleFindFirst: vi.fn(),
  approvalRoutingRuleCreate: vi.fn(),
  approvalRoutingRuleUpdate: vi.fn(),
  approvalRoutingRuleConditionFindMany: vi.fn(),
  approvalRoutingRuleConditionUpdateMany: vi.fn(),
  approvalRoutingRuleConditionCreateMany: vi.fn(),
  approvalRoutingRuleApproverFindMany: vi.fn(),
  approvalRoutingRuleApproverUpdateMany: vi.fn(),
  approvalRoutingRuleApproverCreateMany: vi.fn(),
  financeTeamFindFirst: vi.fn(),
  tenantMembershipFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  $transaction: vi.fn(),
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

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    approvalRoutingRule: {
      count: mocks.approvalRoutingRuleCount,
      findMany: mocks.approvalRoutingRuleFindMany,
      findFirst: mocks.approvalRoutingRuleFindFirst,
      create: mocks.approvalRoutingRuleCreate,
      update: mocks.approvalRoutingRuleUpdate,
    },
    approvalRoutingRuleCondition: {
      findMany: mocks.approvalRoutingRuleConditionFindMany,
      updateMany: mocks.approvalRoutingRuleConditionUpdateMany,
      createMany: mocks.approvalRoutingRuleConditionCreateMany,
    },
    approvalRoutingRuleApprover: {
      findMany: mocks.approvalRoutingRuleApproverFindMany,
      updateMany: mocks.approvalRoutingRuleApproverUpdateMany,
      createMany: mocks.approvalRoutingRuleApproverCreateMany,
    },
    financeTeam: { findFirst: mocks.financeTeamFindFirst },
    tenantMembership: { findFirst: mocks.tenantMembershipFindFirst },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.$transaction,
  },
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/tenant/approval-routing-rules/route";
import {
  GET as GET_DETAIL,
  PATCH as PATCH_RULE,
  DELETE as DELETE_RULE,
} from "@/app/api/tenant/approval-routing-rules/[ruleId]/route";

const TENANT_ID = "cltenant000000000001";
const ACTOR_ID = "clactor0000000000001";
const RULE_ID = "clrule00000000000001";
const TEAM_ID = "clteam00000000000001";
const MEMBERSHIP_ID = "clmemshp00000000001";

const baseSession = {
  user: { id: ACTOR_ID, sessionToken: "s" },
};

const approvalRoutingDisabled = {
  enabled: false,
  maxRules: 0,
  allowSequential: false,
  allowEscalation: false,
  allowCustomField: false,
} satisfies PlanFeatures["approvalRouting"];

const proPlan = {
  planCode: "pro",
  features: {
    assignmentEngine: false,
    approvalRouting: {
      enabled: true,
      maxRules: 5,
      allowSequential: false,
      allowEscalation: false,
      allowCustomField: false,
    },
  } as PlanFeatures,
};

const scalePlan = {
  planCode: "scale",
  features: {
    assignmentEngine: true,
    approvalRouting: {
      enabled: true,
      maxRules: 100,
      allowSequential: true,
      allowEscalation: true,
      allowCustomField: true,
    },
  } as PlanFeatures,
};

const freePlan = {
  planCode: "free",
  features: {
    assignmentEngine: false,
    approvalRouting: approvalRoutingDisabled,
  } as PlanFeatures,
};

function baseCreateBody() {
  return {
    name: "Rule A",
    mode: "PARALLEL",
    conditions: [
      { field: "RECORD_TYPE", operator: "EQUALS", valueString: "BUDGET_REQUEST" },
    ],
    requiredApprovers: [
      {
        targetType: "SPECIFIC_USER",
        targetMembershipId: MEMBERSHIP_ID,
        sequenceOrder: 1,
        requireAll: false,
      },
    ],
  };
}

function setupAuthedManager() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
}

function txMock() {
  mocks.$transaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      return fn({
        approvalRoutingRule: {
          create: mocks.approvalRoutingRuleCreate,
          update: mocks.approvalRoutingRuleUpdate,
          findFirst: mocks.approvalRoutingRuleFindFirst,
        },
        approvalRoutingRuleCondition: {
          updateMany: mocks.approvalRoutingRuleConditionUpdateMany,
          createMany: mocks.approvalRoutingRuleConditionCreateMany,
        },
        approvalRoutingRuleApprover: {
          updateMany: mocks.approvalRoutingRuleApproverUpdateMany,
          createMany: mocks.approvalRoutingRuleApproverCreateMany,
        },
        auditLog: { create: mocks.auditLogCreate },
      });
    }
  );
}

const detailRow = {
  id: RULE_ID,
  name: "Rule A",
  description: null,
  priority: 100,
  mode: "PARALLEL",
  status: "ACTIVE",
  escalationPolicy: "NONE",
  escalationHours: null,
  escalationTargetMembershipId: null,
  triggerOnCreate: true,
  triggerOnAmountChange: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  conditions: [],
  requiredApprovers: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  txMock();
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.resolveTenantPlan.mockResolvedValue(proPlan);
  mocks.approvalRoutingRuleCount.mockResolvedValue(0);
  mocks.tenantMembershipFindFirst.mockResolvedValue({ id: MEMBERSHIP_ID });
});

describe("approvalRoutingRuleApproverSchema (discriminated union)", () => {
  it("rejects SPECIFIC_USER without targetMembershipId", () => {
    const r = approvalRoutingRuleApproverSchema.safeParse({
      targetType: "SPECIFIC_USER",
      sequenceOrder: 1,
      requireAll: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects ROLE without targetWorkspaceRole", () => {
    const r = approvalRoutingRuleApproverSchema.safeParse({
      targetType: "ROLE",
      sequenceOrder: 1,
      requireAll: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects SPECIFIC_USER with stray targetTeamId (.strict)", () => {
    const r = approvalRoutingRuleApproverSchema.safeParse({
      targetType: "SPECIFIC_USER",
      targetMembershipId: MEMBERSHIP_ID,
      targetTeamId: TEAM_ID,
      sequenceOrder: 1,
      requireAll: false,
    });
    expect(r.success).toBe(false);
  });

  it("accepts CREATOR_MANAGER with only sequenceOrder and requireAll", () => {
    const r = approvalRoutingRuleApproverSchema.safeParse({
      targetType: "CREATOR_MANAGER",
      sequenceOrder: 1,
      requireAll: false,
    });
    expect(r.success).toBe(true);
  });
});

describe("POST /api/tenant/approval-routing-rules", () => {
  it("201 creates rule", async () => {
    setupAuthedManager();
    mocks.approvalRoutingRuleFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(detailRow);
    mocks.approvalRoutingRuleCreate.mockResolvedValue({
      id: RULE_ID,
      name: "Rule A",
      mode: "PARALLEL",
      escalationPolicy: "NONE",
    });

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseCreateBody()),
      })
    );
    expect(res.status).toBe(201);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.approval_routing_rule.created",
        metadata: expect.objectContaining({
          ruleId: RULE_ID,
          name: "Rule A",
        }),
      }),
    });
  });

  it("403 UPGRADE_REQUIRED when approval routing disabled", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(freePlan);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseCreateBody()),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("403 UPGRADE_REQUIRED with details.code LIMIT_REACHED when at maxRules", async () => {
    setupAuthedManager();
    mocks.approvalRoutingRuleCount.mockResolvedValue(5);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseCreateBody()),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
    expect(j.error.details?.code).toBe("LIMIT_REACHED");
    expect(j.error.details?.maxRules).toBe(5);
  });

  it("403 UPGRADE_REQUIRED for SEQUENTIAL on Pro", async () => {
    setupAuthedManager();
    const body = {
      ...baseCreateBody(),
      mode: "SEQUENTIAL",
      requiredApprovers: [
        {
          targetType: "SPECIFIC_USER",
          targetMembershipId: MEMBERSHIP_ID,
          sequenceOrder: 1,
          requireAll: false,
        },
        {
          targetType: "SPECIFIC_USER",
          targetMembershipId: MEMBERSHIP_ID,
          sequenceOrder: 2,
          requireAll: false,
        },
      ],
    };
    const parsed = approvalRoutingRuleCreateSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("403 UPGRADE_REQUIRED for escalation on Pro", async () => {
    setupAuthedManager();
    const body = {
      ...baseCreateBody(),
      escalationPolicy: "ESCALATE_AFTER_HOURS",
      escalationHours: 2,
      escalationTargetMembershipId: MEMBERSHIP_ID,
    };
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("403 UPGRADE_REQUIRED for CUSTOM_FIELD condition on Pro", async () => {
    setupAuthedManager();
    const body = {
      ...baseCreateBody(),
      conditions: [
        {
          field: "CUSTOM_FIELD",
          operator: "EQUALS",
          valueString: "v",
          customFieldKey: "cf_1",
        },
      ],
    };
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("400 INVALID_TEAM_REFERENCE for TEAM approver", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const body = {
      ...baseCreateBody(),
      requiredApprovers: [
        {
          targetType: "TEAM",
          targetTeamId: TEAM_ID,
          sequenceOrder: 1,
          requireAll: false,
        },
      ],
    };
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details?.code).toBe("INVALID_TEAM_REFERENCE");
  });

  it("403 FORBIDDEN without permission", async () => {
    setupAuthedManager();
    mocks.hasTenantPermission.mockResolvedValue(false);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseCreateBody()),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /api/tenant/approval-routing-rules", () => {
  it("200 list without resolveTenantPlan", async () => {
    setupAuthedManager();
    mocks.approvalRoutingRuleFindMany.mockResolvedValue([]);
    const res = await GET_LIST(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(mocks.resolveTenantPlan).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tenant/approval-routing-rules/[ruleId]", () => {
  it("403 UPGRADE when plan disabled", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(freePlan);
    const res = await PATCH_RULE(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
      { params: Promise.resolve({ ruleId: RULE_ID }) }
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("403 UPGRADE when body omits conditions but DB has CUSTOM_FIELD (effective merge)", async () => {
    setupAuthedManager();
    mocks.approvalRoutingRuleFindFirst.mockResolvedValueOnce({
      id: RULE_ID,
      name: "R",
      description: null,
      priority: 100,
      mode: "PARALLEL",
      status: "ACTIVE",
      escalationPolicy: "NONE",
      escalationHours: null,
      escalationTargetMembershipId: null,
      triggerOnCreate: true,
      triggerOnAmountChange: false,
    });
    mocks.approvalRoutingRuleConditionFindMany.mockResolvedValue([
      { field: "CUSTOM_FIELD" },
    ]);

    const res = await PATCH_RULE(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ ruleId: RULE_ID }) }
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("soft-deletes conditions and approvers then recreates when arrays sent", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(scalePlan);
    mocks.approvalRoutingRuleFindFirst
      .mockResolvedValueOnce({
        id: RULE_ID,
        name: "R",
        description: null,
        priority: 100,
        mode: "PARALLEL",
        status: "ACTIVE",
        escalationPolicy: "NONE",
        escalationHours: null,
        escalationTargetMembershipId: null,
        triggerOnCreate: true,
        triggerOnAmountChange: false,
      })
      .mockResolvedValueOnce(detailRow);
    mocks.approvalRoutingRuleConditionFindMany.mockResolvedValue([
      { field: "RECORD_TYPE" },
    ]);
    mocks.approvalRoutingRuleUpdate.mockResolvedValue({
      ...detailRow,
      name: "R2",
    });

    const res = await PATCH_RULE(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditions: [
            {
              field: "RECORD_TYPE",
              operator: "EQUALS",
              valueString: "SPEND_APPROVAL",
            },
          ],
          requiredApprovers: [
            {
              targetType: "CREATOR_MANAGER",
              sequenceOrder: 1,
              requireAll: false,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ ruleId: RULE_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.approvalRoutingRuleConditionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
    expect(mocks.approvalRoutingRuleApproverUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
    expect(mocks.approvalRoutingRuleConditionCreateMany).toHaveBeenCalled();
    expect(mocks.approvalRoutingRuleApproverCreateMany).toHaveBeenCalled();
  });
});

describe("DELETE /api/tenant/approval-routing-rules/[ruleId]", () => {
  it("404 when rule already soft-deleted (concealment)", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(scalePlan);
    mocks.approvalRoutingRuleFindFirst.mockResolvedValue(null);
    const res = await DELETE_RULE(new Request("http://localhost"), {
      params: Promise.resolve({ ruleId: RULE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("sets deletedAt and ARCHIVED", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(scalePlan);
    mocks.approvalRoutingRuleFindFirst.mockResolvedValue({
      id: RULE_ID,
      name: "R",
      mode: "PARALLEL",
    });
    mocks.approvalRoutingRuleUpdate.mockResolvedValue({});

    const res = await DELETE_RULE(new Request("http://localhost"), {
      params: Promise.resolve({ ruleId: RULE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.approvalRoutingRuleUpdate).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: {
        deletedAt: expect.any(Date),
        status: "ARCHIVED",
      },
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.approval_routing_rule.deleted",
      }),
    });
  });
});

describe("GET /api/tenant/approval-routing-rules/[ruleId]", () => {
  it("404 when not found", async () => {
    setupAuthedManager();
    mocks.approvalRoutingRuleFindFirst.mockResolvedValue(null);
    const res = await GET_DETAIL(new Request("http://localhost"), {
      params: Promise.resolve({ ruleId: RULE_ID }),
    });
    expect(res.status).toBe(404);
  });
});
