import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  isStepUpEligible: vi.fn(),
  $transaction: vi.fn(),
  tenantMembershipFindUnique: vi.fn(),
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
    tenantMembership: { findUnique: mocks.tenantMembershipFindUnique },
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/request-utils", () => ({
  getBaseUrlFromRequest: () => "http://localhost:3000",
}));

import { PATCH as PATCH_LEGACY_ROLE } from "@/app/api/tenant/users/[userId]/role/route";

const TENANT_ID = "cltenant0000000000001";
const ACTOR_ID = "clactor00000000000001";
const TARGET_USER_ID = "clusertarget000000001";
const TARGET_MEM_ID = "clmemtarget0000000001";

const baseSession = {
  user: { id: ACTOR_ID, sessionToken: "sess-token" },
};

const baseTargetRow = {
  id: TARGET_MEM_ID,
  userId: TARGET_USER_ID,
  status: "ACTIVE" as const,
  workspaceRole: "MEMBER" as const,
  financialAccess: "OWN_AND_PARTICIPATING" as const,
  financeResponsibility: "NONE" as const,
  billingAccess: "NONE" as const,
  roles: [{ role: { name: "Member" } }],
};

function patchReq(userId: string, body: unknown) {
  return new Request(`http://localhost/api/tenant/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.getDefaultTenantForUser.mockResolvedValue({
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
  mocks.isStepUpEligible.mockResolvedValue(true);
  mocks.tenantMembershipFindUnique.mockResolvedValue({ id: TARGET_MEM_ID });

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
  mocks.innerFindFirst.mockResolvedValue(baseTargetRow);
  mocks.innerFindUnique.mockResolvedValue({
    roles: [{ role: { name: "Admin" } }],
  });
  mocks.innerTenantRoleFindMany.mockResolvedValue([
    { id: "r1", name: "Owner" },
    { id: "r2", name: "Admin" },
    { id: "r3", name: "Finance" },
    { id: "r4", name: "Member" },
  ]);
  mocks.innerTenantUserRoleCount.mockResolvedValue(2);
  mocks.innerTenantUserRoleDeleteMany.mockResolvedValue({ count: 1 });
  mocks.innerTenantUserRoleCreate.mockResolvedValue({});
  mocks.innerCount.mockResolvedValue(1);
  mocks.innerUpdate.mockResolvedValue({});
  mocks.innerAuditCreate.mockResolvedValue({});
});

describe("PATCH /api/tenant/users/[userId]/role (deprecated D-1a)", () => {
  it("returns Deprecation, Sunset, and Link headers on success", async () => {
    const res = await PATCH_LEGACY_ROLE(patchReq(TARGET_USER_ID, { role: "Finance" }), {
      params: Promise.resolve({ userId: TARGET_USER_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    expect(res.headers.get("Sunset")).toBe("Sat, 01 Jan 2027 00:00:00 GMT");
    const link = res.headers.get("Link");
    expect(link).toContain("successor-version");
    expect(link).toContain(`/api/settings/workspace/members/${TARGET_MEM_ID}`);
  });

  it("returns 403 STEP_UP_REQUIRED when step-up not satisfied (B3)", async () => {
    mocks.isStepUpEligible.mockResolvedValue(false);

    const res = await PATCH_LEGACY_ROLE(patchReq(TARGET_USER_ID, { role: "Finance" }), {
      params: Promise.resolve({ userId: TARGET_USER_ID }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.details?.code).toBe("STEP_UP_REQUIRED");
  });
});
