import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  isStepUpEligible: vi.fn(),
  userFindUnique: vi.fn(),
  tenantMembershipFindMany: vi.fn(),
  workspaceMemberSecurityFindMany: vi.fn(),
  $transaction: vi.fn(),
  innerFindFirst: vi.fn(),
  innerFindUnique: vi.fn(),
  innerCount: vi.fn(),
  innerUpdate: vi.fn(),
  innerAuditCreate: vi.fn(),
  innerTenantRoleFindMany: vi.fn(),
  innerTenantUserRoleCount: vi.fn(),
  innerTenantUserRoleDeleteMany: vi.fn(),
  innerTenantUserRoleCreate: vi.fn(),
  writeAuditLog: vi.fn(),
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

vi.mock("@/server/services/step-up", () => ({
  isStepUpEligible: mocks.isStepUpEligible,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    tenantMembership: {
      findMany: mocks.tenantMembershipFindMany,
    },
    workspaceMemberSecurity: { findMany: mocks.workspaceMemberSecurityFindMany },
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/server/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

import { GET as GET_MEMBERS } from "@/app/api/settings/workspace/members/route";
import { PATCH as PATCH_MEMBER_4AXIS } from "@/app/api/settings/workspace/members/[memberId]/route";

const TENANT_ID = "cltenant0000000000001";
const ACTOR_ID = "clactor00000000000001";
const TARGET_MEM_ID = "clmemtarget0000000001";
const TARGET_USER_ID = "clusertarget000000001";

const baseSession = {
  user: {
    id: ACTOR_ID,
    sessionToken: "sess-token",
  },
};

const baseTarget = {
  id: TARGET_MEM_ID,
  userId: TARGET_USER_ID,
  status: "ACTIVE" as const,
  workspaceRole: "MEMBER" as const,
  financialAccess: "OWN_AND_PARTICIPATING" as const,
  financeResponsibility: "NONE" as const,
  billingAccess: "NONE" as const,
  roles: [{ role: { name: "Member" } }],
};

function patchReq(memberId: string, body: unknown) {
  return new Request(`http://localhost/api/settings/workspace/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Full row returned by tx.tenantMembership.findFirst inside D-1a unified service. */
function txTarget(overrides: Record<string, unknown> = {}) {
  return { ...baseTarget, ...overrides } as typeof baseTarget;
}

function setupHappyAuth() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
  mocks.isStepUpEligible.mockResolvedValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(
    async (fn: (tx: {
      tenantMembership: {
        findFirst: typeof mocks.innerFindFirst;
        findUnique: typeof mocks.innerFindUnique;
        count: typeof mocks.innerCount;
        update: typeof mocks.innerUpdate;
      };
      tenantRole: { findMany: typeof mocks.innerTenantRoleFindMany };
      tenantUserRole: {
        count: typeof mocks.innerTenantUserRoleCount;
        deleteMany: typeof mocks.innerTenantUserRoleDeleteMany;
        create: typeof mocks.innerTenantUserRoleCreate;
      };
      auditLog: { create: typeof mocks.innerAuditCreate };
    }) => Promise<unknown>) => {
      return fn({
        tenantMembership: {
          findFirst: mocks.innerFindFirst,
          findUnique: mocks.innerFindUnique,
          count: mocks.innerCount,
          update: mocks.innerUpdate,
        },
        tenantRole: { findMany: mocks.innerTenantRoleFindMany },
        tenantUserRole: {
          count: mocks.innerTenantUserRoleCount,
          deleteMany: mocks.innerTenantUserRoleDeleteMany,
          create: mocks.innerTenantUserRoleCreate,
        },
        auditLog: { create: mocks.innerAuditCreate },
      });
    }
  );
  mocks.innerFindFirst.mockResolvedValue({
    id: TARGET_MEM_ID,
    userId: TARGET_USER_ID,
    status: "ACTIVE",
    workspaceRole: baseTarget.workspaceRole,
    financialAccess: baseTarget.financialAccess,
    financeResponsibility: baseTarget.financeResponsibility,
    billingAccess: baseTarget.billingAccess,
    roles: baseTarget.roles,
  });
  /** D-1a A1: Actor outranks Member target so hierarchy allows axis updates. */
  mocks.innerFindUnique.mockResolvedValue({
    roles: [{ role: { name: "Admin" } }],
  });
  mocks.innerTenantRoleFindMany.mockResolvedValue([]);
  mocks.innerTenantUserRoleCount.mockResolvedValue(0);
  mocks.innerTenantUserRoleDeleteMany.mockResolvedValue({ count: 0 });
  mocks.innerTenantUserRoleCreate.mockResolvedValue({});
  mocks.innerCount.mockResolvedValue(1);
  mocks.innerUpdate.mockResolvedValue({});
  mocks.innerAuditCreate.mockResolvedValue({});
});

describe("PATCH /api/settings/workspace/members/[memberId] (4-axis)", () => {
  it("returns 200 and updates financialAccess for another member", async () => {
    setupHappyAuth();

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.financialAccess).toBe("ALL");
    expect(mocks.innerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TARGET_MEM_ID },
        data: { financialAccess: "ALL" },
      })
    );
    expect(mocks.innerAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tenant.member.access_updated",
          metadata: expect.objectContaining({
            fieldsChanged: ["financialAccess"],
            before: expect.any(Object),
            after: expect.any(Object),
          }),
        }),
      })
    );
  });

  it("returns 200 for partial billingAccess only", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(txTarget({ billingAccess: "READ" }));

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { billingAccess: "MANAGE" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.billingAccess).toBe("MANAGE");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    mocks.requireFullSession.mockResolvedValue(null);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 without tenant.users.manage", async () => {
    setupHappyAuth();
    mocks.hasTenantPermission.mockResolvedValue(false);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 STEP_UP_REQUIRED when step-up not satisfied", async () => {
    setupHappyAuth();
    mocks.isStepUpEligible.mockResolvedValue(false);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.details?.code).toBe("STEP_UP_REQUIRED");
  });

  it("returns 403 when actor is platform-blocked", async () => {
    setupHappyAuth();
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 when target is the same user as actor (self-modify)", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(txTarget({ userId: ACTOR_ID }));

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 MEMBER_ACCESS_HIERARCHY when actor does not outrank target (D-1a A1)", async () => {
    setupHappyAuth();
    mocks.innerFindUnique.mockResolvedValue({
      roles: [{ role: { name: "Admin" } }],
    });
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({ roles: [{ role: { name: "Admin" } }] })
    );

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.details?.code).toBe("MEMBER_ACCESS_HIERARCHY");
  });

  it("returns 400 PRIMARY_OWNER_AXIS_LOCKED when target is Primary Owner", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({ roles: [{ role: { name: "Primary Owner" } }] })
    );

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details?.code).toBe("PRIMARY_OWNER_AXIS_LOCKED");
  });

  it("returns 404 when membership not in tenant", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(null);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when membership is not ACTIVE", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(null);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when body has no 4-axis fields", async () => {
    setupHappyAuth();

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, {}),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for forbidden combination OWNER + financialAccess NONE", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        billingAccess: "MANAGE",
        financeResponsibility: "NONE",
      })
    );

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "NONE" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details?.code).toBe("OWNER_FINANCIAL_ACCESS_CANNOT_BE_NONE");
    expect(mocks.innerUpdate).not.toHaveBeenCalled();
    expect(mocks.innerAuditCreate).not.toHaveBeenCalled();
  });

  it("returns 409 AT_LEAST_ONE_OWNER_REQUIRES_BILLING_MANAGE", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        financeResponsibility: "NONE",
        billingAccess: "MANAGE",
      })
    );
    mocks.innerCount.mockResolvedValueOnce(0);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { billingAccess: "READ" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.details?.code).toBe("AT_LEAST_ONE_OWNER_REQUIRES_BILLING_MANAGE");
    expect(mocks.innerAuditCreate).not.toHaveBeenCalled();
  });

  it("returns 409 CANNOT_DEMOTE_LAST_OWNER", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        billingAccess: "MANAGE",
        financeResponsibility: "NONE",
      })
    );
    mocks.innerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { workspaceRole: "ADMIN" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.details?.code).toBe("CANNOT_DEMOTE_LAST_OWNER");
  });

  it("returns 200 when another OWNER+MANAGE exists and this owner is demoted on billing only with peer", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        billingAccess: "MANAGE",
        financeResponsibility: "NONE",
      })
    );
    mocks.innerCount.mockResolvedValueOnce(1);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { billingAccess: "READ" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mocks.innerAuditCreate).toHaveBeenCalled();
  });

  it("returns 400 for invalid membership id", async () => {
    setupHappyAuth();

    const res = await PATCH_MEMBER_4AXIS(
      patchReq("not-a-cuid", { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: "not-a-cuid" }) }
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "MEMBER",
        financialAccess: "NONE",
        financeResponsibility: "NONE",
        billingAccess: "NONE",
      })
    );

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financeResponsibility: "PROCESS" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details?.code).toBe("FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY");
  });

  it("returns 400 OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE for OWNER + DEPARTMENT", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        billingAccess: "MANAGE",
        financeResponsibility: "NONE",
      })
    );

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "DEPARTMENT" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details?.code).toBe("OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE");
  });

  it("returns 404 when membership disappears inside transaction", async () => {
    setupHappyAuth();
    mocks.innerFindFirst
      .mockResolvedValueOnce(txTarget())
      .mockResolvedValueOnce(null);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 demoting workspaceRole when another OWNER exists", async () => {
    setupHappyAuth();
    mocks.innerFindFirst.mockResolvedValue(
      txTarget({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        billingAccess: "MANAGE",
        financeResponsibility: "NONE",
      })
    );
    mocks.innerCount.mockReset();
    mocks.innerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const res = await PATCH_MEMBER_4AXIS(
      patchReq(TARGET_MEM_ID, { workspaceRole: "ADMIN" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mocks.innerAuditCreate).toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    setupHappyAuth();

    const res = await PATCH_MEMBER_4AXIS(
      new Request(`http://localhost/api/settings/workspace/members/${TARGET_MEM_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/settings/workspace/members (4-axis fields)", () => {
  it("includes membershipId and 4-axis enums on each item", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.getDefaultTenantForUser.mockResolvedValue({
      tenant: { id: TENANT_ID, name: "T", slug: "t" },
    });
    mocks.hasTenantPermission.mockResolvedValue(true);
    mocks.tenantMembershipFindMany.mockResolvedValue([
      {
        id: TARGET_MEM_ID,
        status: "ACTIVE",
        joinedAt: new Date("2026-01-01"),
        workspaceRole: "ADMIN",
        financialAccess: "ALL",
        financeResponsibility: "PROCESS",
        billingAccess: "READ",
        user: {
          id: TARGET_USER_ID,
          email: "a@b.co",
          name: "N",
          image: null,
          security: { totpEnabled: false },
        },
        roles: [{ role: { name: "Admin" } }],
      },
    ]);
    mocks.workspaceMemberSecurityFindMany.mockResolvedValue([]);

    const res = await GET_MEMBERS(
      new Request("http://localhost/api/settings/workspace/members")
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toHaveLength(1);
    const item = json.data.items[0];
    expect(item.membershipId).toBe(TARGET_MEM_ID);
    expect(item.workspaceRole).toBe("ADMIN");
    expect(item.financialAccess).toBe("ALL");
    expect(item.financeResponsibility).toBe("PROCESS");
    expect(item.billingAccess).toBe("READ");
    expect(item.role).toBeDefined();
    expect(item.userId).toBe(TARGET_USER_ID);
  });
});
