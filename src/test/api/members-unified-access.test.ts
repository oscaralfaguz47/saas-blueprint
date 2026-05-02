import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  isStepUpEligible: vi.fn(),
  userFindUnique: vi.fn(),
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
    $transaction: mocks.$transaction,
  },
}));

import { PATCH as PATCH_MEMBER_ACCESS } from "@/app/api/settings/workspace/members/[memberId]/route";

const TENANT_ID = "cltenant0000000000001";
const ACTOR_ID = "clactor00000000000001";
const TARGET_MEM_ID = "clmemtarget0000000001";
const TARGET_USER_ID = "clusertarget000000001";

const baseSession = {
  user: { id: ACTOR_ID, sessionToken: "sess-token" },
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

function txTarget(overrides: Partial<typeof baseTarget> = {}) {
  return { ...baseTarget, ...overrides };
}

function patchReq(memberId: string, body: unknown) {
  return new Request(`http://localhost/api/settings/workspace/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  mocks.innerFindFirst.mockResolvedValue(txTarget());
  mocks.innerFindUnique.mockResolvedValue({
    roles: [{ role: { name: "Admin" } }],
  });
  mocks.innerTenantRoleFindMany.mockResolvedValue([
    { id: "r1", name: "Owner" },
    { id: "r2", name: "Admin" },
    { id: "r3", name: "Finance" },
    { id: "r4", name: "Member" },
  ]);
  /** getOwnerLevelCountTx: must be >= 1 when actor is not Primary Owner (legacy parity). */
  mocks.innerTenantUserRoleCount.mockResolvedValue(2);
  mocks.innerTenantUserRoleDeleteMany.mockResolvedValue({ count: 1 });
  mocks.innerTenantUserRoleCreate.mockResolvedValue({});
  mocks.innerCount.mockResolvedValue(1);
  mocks.innerUpdate.mockResolvedValue({});
  mocks.innerAuditCreate.mockResolvedValue({});
});

describe("PATCH /api/settings/workspace/members/[memberId] unified (D-1a)", () => {
  it("returns 403 when axis field present but tenant.users.manage denied (C3)", async () => {
    setupHappyAuth();
    mocks.hasTenantPermission.mockImplementation(
      async (p: { permission: string }) => p.permission !== "tenant.users.manage"
    );

    const res = await PATCH_MEMBER_ACCESS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 when only legacy role in body but tenant.roles.manage denied (C3)", async () => {
    setupHappyAuth();
    mocks.hasTenantPermission.mockImplementation(
      async (p: { permission: string }) => p.permission !== "tenant.roles.manage"
    );

    const res = await PATCH_MEMBER_ACCESS(
      patchReq(TARGET_MEM_ID, { role: "Finance" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 200 and updates legacy role when body is role-only and permissions allow", async () => {
    setupHappyAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    mocks.innerFindFirst.mockResolvedValue(txTarget({ roles: [{ role: { name: "Member" } }] }));

    const res = await PATCH_MEMBER_ACCESS(
      patchReq(TARGET_MEM_ID, { role: "Finance" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.role).toBe("Finance");
    expect(mocks.innerTenantUserRoleDeleteMany).toHaveBeenCalled();
    expect(mocks.innerTenantUserRoleCreate).toHaveBeenCalled();
    expect(mocks.innerAuditCreate).toHaveBeenCalled();
  });

  it("returns 403 STEP_UP_REQUIRED after successful permission checks (B3 order)", async () => {
    setupHappyAuth();
    mocks.isStepUpEligible.mockResolvedValue(false);

    const res = await PATCH_MEMBER_ACCESS(
      patchReq(TARGET_MEM_ID, { financialAccess: "ALL" }),
      { params: Promise.resolve({ memberId: TARGET_MEM_ID }) }
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.details?.code).toBe("STEP_UP_REQUIRED");
  });
});
