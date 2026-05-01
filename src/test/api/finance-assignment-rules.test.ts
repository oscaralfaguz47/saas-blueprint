import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  resolveTenantPlan: vi.fn(),
  financeAssignmentRuleFindMany: vi.fn(),
  financeAssignmentRuleFindFirst: vi.fn(),
  financeAssignmentRuleCreate: vi.fn(),
  financeAssignmentRuleUpdate: vi.fn(),
  financeAssignmentRuleConditionCreateMany: vi.fn(),
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
    financeAssignmentRule: {
      findMany: mocks.financeAssignmentRuleFindMany,
      findFirst: mocks.financeAssignmentRuleFindFirst,
      create: mocks.financeAssignmentRuleCreate,
      update: mocks.financeAssignmentRuleUpdate,
    },
    financeAssignmentRuleCondition: {
      createMany: mocks.financeAssignmentRuleConditionCreateMany,
    },
    financeTeam: { findFirst: mocks.financeTeamFindFirst },
    tenantMembership: { findFirst: mocks.tenantMembershipFindFirst },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.$transaction,
  },
}));

import type { PlanFeatures } from "@/server/billing/provider-types";
import { validateConditionShape } from "@/lib/validations/finance-assignment-rule";
import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/tenant/finance-assignment-rules/route";
import {
  GET as GET_DETAIL,
  PATCH as PATCH_RULE,
  DELETE as DELETE_RULE,
} from "@/app/api/tenant/finance-assignment-rules/[ruleId]/route";

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
};

const enterprisePlan = {
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
    async (
      fn: (tx: {
        financeAssignmentRule: { create: typeof mocks.financeAssignmentRuleCreate; update: typeof mocks.financeAssignmentRuleUpdate; findFirst: typeof mocks.financeAssignmentRuleFindFirst };
        financeAssignmentRuleCondition: { createMany: typeof mocks.financeAssignmentRuleConditionCreateMany };
        auditLog: { create: typeof mocks.auditLogCreate };
      }) => Promise<unknown>
    ) => {
      return fn({
        financeAssignmentRule: {
          create: mocks.financeAssignmentRuleCreate,
          update: mocks.financeAssignmentRuleUpdate,
          findFirst: mocks.financeAssignmentRuleFindFirst,
        },
        financeAssignmentRuleCondition: { createMany: mocks.financeAssignmentRuleConditionCreateMany },
        auditLog: { create: mocks.auditLogCreate },
      });
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock();
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.resolveTenantPlan.mockResolvedValue(enterprisePlan);
});

describe("POST /api/tenant/finance-assignment-rules", () => {
  it("201 creates rule with 0 conditions", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeAssignmentRuleFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: RULE_ID,
        name: "R1",
        description: null,
        priority: 100,
        teamId: TEAM_ID,
        strategy: "ROUND_ROBIN",
        specificMembershipId: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        conditions: [],
      });
    mocks.financeAssignmentRuleCreate.mockResolvedValue({
      id: RULE_ID,
      name: "R1",
      teamId: TEAM_ID,
      strategy: "ROUND_ROBIN",
    });

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "R1",
          teamId: TEAM_ID,
          conditions: [],
        }),
      })
    );
    expect(res.status).toBe(201);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.assignment_rule.created",
        metadata: expect.objectContaining({
          ruleId: RULE_ID,
          name: "R1",
          teamId: TEAM_ID,
          conditionCount: 0,
        }),
      }),
    });
  });

  it("403 UPGRADE_REQUIRED when assignmentEngine false", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(freePlan);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "R", teamId: TEAM_ID, conditions: [] }),
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("FORBIDDEN");
    expect(j.error.details?.code).toBe("UPGRADE_REQUIRED");
  });

  it("400 INVALID_TEAM_REFERENCE when team missing", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "R", teamId: TEAM_ID, conditions: [] }),
      })
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details?.code).toBe("INVALID_TEAM_REFERENCE");
  });

  it("400 SPECIFIC_MEMBER without membership id", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "R",
          teamId: TEAM_ID,
          strategy: "SPECIFIC_MEMBER",
          conditions: [],
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("201 SPECIFIC_MEMBER with membership", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeAssignmentRuleFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: RULE_ID,
        name: "R",
        description: null,
        priority: 100,
        teamId: TEAM_ID,
        strategy: "SPECIFIC_MEMBER",
        specificMembershipId: MEMBERSHIP_ID,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        conditions: [],
      });
    mocks.tenantMembershipFindFirst.mockResolvedValue({ id: MEMBERSHIP_ID });
    mocks.financeAssignmentRuleCreate.mockResolvedValue({
      id: RULE_ID,
      name: "R",
      teamId: TEAM_ID,
      strategy: "SPECIFIC_MEMBER",
    });

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "R",
          teamId: TEAM_ID,
          strategy: "SPECIFIC_MEMBER",
          specificMembershipId: MEMBERSHIP_ID,
          conditions: [],
        }),
      })
    );
    expect(res.status).toBe(201);
  });

  it("400 when conditions exceed 20", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    const conditions = Array.from({ length: 21 }, (_, i) => ({
      field: "TAG",
      operator: "EQUALS",
      valueString: `t${i}`,
    }));
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "R", teamId: TEAM_ID, conditions }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 CUSTOM_FIELD without key", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "R",
          teamId: TEAM_ID,
          conditions: [{ field: "CUSTOM_FIELD", operator: "EQUALS", valueString: "x" }],
        }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("validateConditionShape", () => {
  it("allows IS_NULL without values", () => {
    expect(
      validateConditionShape({
        field: "TAG",
        operator: "IS_NULL",
      })
    ).toBeNull();
  });

  it("rejects IS_NULL with valueString", () => {
    expect(
      validateConditionShape({
        field: "TAG",
        operator: "IS_NULL",
        valueString: "x",
      })
    ).toBe("NULL_OPERATOR_REJECTS_VALUE");
  });

  it("requires numeric array for REQUESTED_AMOUNT IN", () => {
    expect(
      validateConditionShape({
        field: "REQUESTED_AMOUNT",
        operator: "IN",
        valueJson: ["a"],
      })
    ).toBe("IN_OPERATOR_REQUIRES_NUMERIC_ARRAY");
  });

  it("allows REQUESTED_AMOUNT IN with numbers", () => {
    expect(
      validateConditionShape({
        field: "REQUESTED_AMOUNT",
        operator: "IN",
        valueJson: [1, 2],
      })
    ).toBeNull();
  });

  it("requires cuid array for DEPARTMENT_ID IN", () => {
    expect(
      validateConditionShape({
        field: "DEPARTMENT_ID",
        operator: "IN",
        valueJson: ["not-a-cuid"],
      })
    ).toBe("ID_FIELD_IN_REQUIRES_CUID_ARRAY");
  });

  it("allows DEPARTMENT_ID IN with cuids", () => {
    expect(
      validateConditionShape({
        field: "DEPARTMENT_ID",
        operator: "IN",
        valueJson: ["cldept00000000000001", "cldept00000000000002"],
      })
    ).toBeNull();
  });

  it("requires CUSTOM_FIELD key", () => {
    expect(
      validateConditionShape({
        field: "CUSTOM_FIELD",
        operator: "EQUALS",
        valueString: "v",
      })
    ).toBe("CUSTOM_FIELD_REQUIRES_KEY");
  });
});

describe("GET /api/tenant/finance-assignment-rules", () => {
  it("200 list without calling resolveTenantPlan", async () => {
    setupAuthedManager();
    mocks.financeAssignmentRuleFindMany.mockResolvedValue([]);
    const res = await GET_LIST(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(mocks.resolveTenantPlan).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tenant/finance-assignment-rules/[ruleId]", () => {
  it("403 when plan has no assignment engine", async () => {
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
  });

  it("200 clears specificMembershipId when strategy moves off SPECIFIC_MEMBER", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(enterprisePlan);
    mocks.financeAssignmentRuleFindFirst.mockResolvedValue({
      id: RULE_ID,
      name: "R",
      description: null,
      priority: 100,
      teamId: TEAM_ID,
      strategy: "SPECIFIC_MEMBER",
      specificMembershipId: MEMBERSHIP_ID,
      status: "ACTIVE",
    });
    mocks.financeAssignmentRuleUpdate.mockResolvedValue({
      id: RULE_ID,
      name: "R",
      description: null,
      priority: 100,
      teamId: TEAM_ID,
      strategy: "ROUND_ROBIN",
      specificMembershipId: null,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const res = await PATCH_RULE(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: "ROUND_ROBIN" }),
      }),
      { params: Promise.resolve({ ruleId: RULE_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.financeAssignmentRuleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          strategy: "ROUND_ROBIN",
          specificMembershipId: null,
        }),
      })
    );
  });
});

describe("DELETE /api/tenant/finance-assignment-rules/[ruleId]", () => {
  it("403 when plan has no assignment engine", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(freePlan);
    const res = await DELETE_RULE(new Request("http://localhost"), {
      params: Promise.resolve({ ruleId: RULE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("200 soft delete sets deletedAt only", async () => {
    setupAuthedManager();
    mocks.resolveTenantPlan.mockResolvedValue(enterprisePlan);
    mocks.financeAssignmentRuleFindFirst.mockResolvedValue({
      id: RULE_ID,
      name: "R",
      teamId: TEAM_ID,
    });
    mocks.financeAssignmentRuleUpdate.mockResolvedValue({});

    const res = await DELETE_RULE(new Request("http://localhost"), {
      params: Promise.resolve({ ruleId: RULE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.financeAssignmentRuleUpdate).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
