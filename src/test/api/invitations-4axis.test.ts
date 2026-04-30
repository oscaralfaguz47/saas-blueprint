import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  writeAuditLog: vi.fn(),
  sendInvitationEmail: vi.fn(),
  getBaseUrlFromRequest: vi.fn(),
  deleteUserDraftTenants: vi.fn(),
  tenantInvitationFindMany: vi.fn(),
  tenantInvitationFindUnique: vi.fn(),
  tenantInvitationFindFirst: vi.fn(),
  tenantInvitationCreate: vi.fn(),
  tenantInvitationUpdateMany: vi.fn(),
  tenantMembershipFindUnique: vi.fn(),
  tenantMembershipCreate: vi.fn(),
  tenantMembershipUpdate: vi.fn(),
  tenantMembershipUpdateMany: vi.fn(),
  tenantRoleFindUnique: vi.fn(),
  tenantRoleCreate: vi.fn(),
  tenantUserRoleCreate: vi.fn(),
  userFindUnique: vi.fn(),
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

vi.mock("@/server/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/server/services/invitation-email", () => ({
  sendInvitationEmail: mocks.sendInvitationEmail,
}));

vi.mock("@/lib/request-utils", () => ({
  getBaseUrlFromRequest: mocks.getBaseUrlFromRequest,
}));

vi.mock("@/server/services/tenancy-bootstrap", () => ({
  deleteUserDraftTenants: mocks.deleteUserDraftTenants,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    tenantInvitation: {
      findMany: mocks.tenantInvitationFindMany,
      findUnique: mocks.tenantInvitationFindUnique,
      findFirst: mocks.tenantInvitationFindFirst,
      create: mocks.tenantInvitationCreate,
    },
    tenantMembership: {
      findUnique: mocks.tenantMembershipFindUnique,
      create: mocks.tenantMembershipCreate,
      update: mocks.tenantMembershipUpdate,
      updateMany: mocks.tenantMembershipUpdateMany,
    },
    tenantRole: {
      findUnique: mocks.tenantRoleFindUnique,
      create: mocks.tenantRoleCreate,
    },
    tenantUserRole: {
      create: mocks.tenantUserRoleCreate,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
    $transaction: mocks.$transaction,
  },
}));

import { GET as GET_INVITES, POST as POST_INVITE } from "@/app/api/tenant/invitations/route";
import { POST as POST_ACCEPT_ID } from "@/app/api/tenant/invitations/[id]/accept/route";
import { POST as POST_ACCEPT_TOKEN } from "@/app/api/tenant/invitations/accept/route";

const TENANT_ID = "cltenant000000000001";
const ACTOR_ID = "clactor0000000000001";
const INVITE_ID = "clinvite000000000001";
const MEMBERSHIP_ID = "clmem00000000000001";

const baseSession = {
  user: {
    id: ACTOR_ID,
    email: "invitee@example.com",
    sessionToken: "sess-token",
  },
};

const defaultInviteAxes = {
  workspaceRole: "MEMBER" as const,
  financialAccess: "OWN_AND_PARTICIPATING" as const,
  financeResponsibility: "NONE" as const,
  billingAccess: "NONE" as const,
};

const pendingInviteRow = {
  id: INVITE_ID,
  tenantId: TENANT_ID,
  email: "invitee@example.com",
  status: "PENDING" as const,
  acceptedAt: null,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86400000),
  role: "Member",
  ...defaultInviteAxes,
};

function setupInviteAuth() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.getDefaultTenantForUser.mockResolvedValue({
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.getBaseUrlFromRequest.mockReturnValue("http://localhost:3000");
}

function setupInviterMembership(overrides: {
  workspaceRole?: "OWNER" | "ADMIN" | "MEMBER";
  roleNames?: string[];
} = {}) {
  const { workspaceRole = "OWNER", roleNames = ["Owner"] } = overrides;
  mocks.tenantMembershipFindUnique.mockResolvedValue({
    workspaceRole,
    roles: roleNames.map((name) => ({ role: { name } })),
  });
}

function postInvite(body: unknown) {
  return new Request("http://localhost/api/tenant/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.tenantInvitationFindFirst.mockResolvedValue(null);
  mocks.sendInvitationEmail.mockResolvedValue(undefined);
  mocks.deleteUserDraftTenants.mockResolvedValue(undefined);
  mocks.$transaction.mockImplementation(
    async (
      arg:
        | Array<{ then: (onfulfilled: () => unknown) => Promise<unknown> }>
        | ((
            tx: {
              tenantInvitation: { updateMany: typeof mocks.tenantInvitationUpdateMany };
              tenantMembership: {
                update: typeof mocks.tenantMembershipUpdate;
                create: typeof mocks.tenantMembershipCreate;
              };
              tenantRole: {
                findUnique: typeof mocks.tenantRoleFindUnique;
                create: typeof mocks.tenantRoleCreate;
              };
              tenantUserRole: { create: typeof mocks.tenantUserRoleCreate };
            }
          ) => Promise<unknown>)
    ) => {
      if (typeof arg === "function") {
        const tx = {
          tenantInvitation: { updateMany: mocks.tenantInvitationUpdateMany },
          tenantMembership: {
            update: mocks.tenantMembershipUpdate,
            create: mocks.tenantMembershipCreate,
          },
          tenantRole: {
            findUnique: mocks.tenantRoleFindUnique,
            create: mocks.tenantRoleCreate,
          },
          tenantUserRole: { create: mocks.tenantUserRoleCreate },
        };
        return arg(tx);
      }
      return Promise.all(arg.map((op) => op));
    }
  );
  mocks.tenantInvitationUpdateMany.mockResolvedValue({ count: 1 });
  mocks.tenantMembershipCreate.mockResolvedValue({ id: MEMBERSHIP_ID });
  mocks.tenantRoleFindUnique.mockResolvedValue({ id: "role-1" });
  mocks.tenantUserRoleCreate.mockResolvedValue({});
});

describe("POST /api/tenant/invitations (4-axis)", () => {
  it("creates invitation without 4-axis keys when body omits them", async () => {
    setupInviteAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    setupInviterMembership();
    mocks.tenantInvitationCreate.mockResolvedValue({
      id: INVITE_ID,
      email: "a@b.com",
      expiresAt: new Date(),
      acceptedAt: null,
      role: "Member",
      ...defaultInviteAxes,
    });

    const res = await POST_INVITE(
      postInvite({ email: "a@b.com", sendEmail: false, role: "Member" })
    );
    expect(res.status).toBe(200);
    expect(mocks.tenantInvitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          workspaceRole: expect.anything(),
        }),
      })
    );
    const createArg = mocks.tenantInvitationCreate.mock.calls[0][0];
    expect(createArg.data.workspaceRole).toBeUndefined();
    expect(createArg.data.financialAccess).toBeUndefined();
  });

  it("persists all four axes when provided and valid", async () => {
    setupInviteAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    setupInviterMembership();
    mocks.tenantInvitationCreate.mockResolvedValue({
      id: INVITE_ID,
      email: "a@b.com",
      expiresAt: new Date(),
      acceptedAt: null,
      role: "Member",
      workspaceRole: "ADMIN",
      financialAccess: "ALL",
      financeResponsibility: "NONE",
      billingAccess: "READ",
    });

    const res = await POST_INVITE(
      postInvite({
        email: "a@b.com",
        sendEmail: false,
        role: "Member",
        workspaceRole: "ADMIN",
        financialAccess: "ALL",
        financeResponsibility: "NONE",
        billingAccess: "READ",
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.tenantInvitationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceRole: "ADMIN",
        financialAccess: "ALL",
        financeResponsibility: "NONE",
        billingAccess: "READ",
      }),
      select: expect.any(Object),
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant.user.invited",
        metadata: expect.objectContaining({
          axes: expect.objectContaining({ workspaceRole: "ADMIN" }),
          axesExplicit: expect.objectContaining({ workspaceRole: true }),
        }),
      })
    );
  });

  it("returns 400 for forbidden 4-axis combination", async () => {
    setupInviteAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    setupInviterMembership();

    const res = await POST_INVITE(
      postInvite({
        email: "a@b.com",
        sendEmail: false,
        role: "Member",
        workspaceRole: "OWNER",
        financialAccess: "NONE",
        financeResponsibility: "NONE",
        billingAccess: "NONE",
      })
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details?.code).toBe("OWNER_FINANCIAL_ACCESS_CANNOT_BE_NONE");
    expect(mocks.tenantInvitationCreate).not.toHaveBeenCalled();
  });

  it("accepts partial axis: only billingAccess in create data", async () => {
    setupInviteAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    setupInviterMembership();
    mocks.tenantInvitationCreate.mockResolvedValue({
      id: INVITE_ID,
      email: "a@b.com",
      expiresAt: new Date(),
      acceptedAt: null,
      role: "Member",
      ...defaultInviteAxes,
      billingAccess: "READ",
    });

    const res = await POST_INVITE(
      postInvite({
        email: "a@b.com",
        sendEmail: false,
        role: "Member",
        billingAccess: "READ",
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.tenantInvitationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ billingAccess: "READ" }),
      select: expect.any(Object),
    });
    const data = mocks.tenantInvitationCreate.mock.calls[0][0].data;
    expect(data.workspaceRole).toBeUndefined();
    expect(data.financialAccess).toBeUndefined();
  });

  it("returns 403 when inviter workspace rank is lower than requested workspaceRole", async () => {
    setupInviteAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    setupInviterMembership({ workspaceRole: "ADMIN", roleNames: ["Admin"] });

    const res = await POST_INVITE(
      postInvite({
        email: "a@b.com",
        sendEmail: false,
        role: "Member",
        workspaceRole: "OWNER",
      })
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.details?.code).toBe("WORKSPACE_ROLE_RANK_EXCEEDED");
    expect(mocks.tenantInvitationCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/tenant/invitations/[id]/accept (4-axis)", () => {
  it("creates membership with invitation 4-axis values", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindUnique.mockResolvedValue({ ...pendingInviteRow });
    mocks.userFindUnique.mockResolvedValue({ id: ACTOR_ID, isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);

    const res = await POST_ACCEPT_ID(new Request("http://localhost"), {
      params: Promise.resolve({ id: INVITE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.tenantMembershipCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        workspaceRole: "MEMBER",
        financialAccess: "OWN_AND_PARTICIPATING",
        financeResponsibility: "NONE",
        billingAccess: "NONE",
      }),
      select: { id: true },
    });
  });

  it("returns 400 when invitation row has invalid 4-axis combination", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindUnique.mockResolvedValue({
      ...pendingInviteRow,
      workspaceRole: "OWNER",
      financialAccess: "NONE",
    });
    mocks.userFindUnique.mockResolvedValue({ id: ACTOR_ID, isPlatformBlocked: false });

    const res = await POST_ACCEPT_ID(new Request("http://localhost"), {
      params: Promise.resolve({ id: INVITE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("reactivates DISABLED membership and refreshes 4-axis from invitation", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindUnique.mockResolvedValue({
      ...pendingInviteRow,
      workspaceRole: "ADMIN",
      billingAccess: "READ",
    });
    mocks.userFindUnique.mockResolvedValue({ id: ACTOR_ID, isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: MEMBERSHIP_ID,
      status: "DISABLED",
    });

    const res = await POST_ACCEPT_ID(new Request("http://localhost"), {
      params: Promise.resolve({ id: INVITE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.tenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: MEMBERSHIP_ID },
      data: expect.objectContaining({
        status: "ACTIVE",
        workspaceRole: "ADMIN",
        billingAccess: "READ",
      }),
    });
    expect(mocks.tenantMembershipCreate).not.toHaveBeenCalled();
  });

  it("alreadyMember ACTIVE does not call membership create", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindUnique.mockResolvedValue({ ...pendingInviteRow });
    mocks.userFindUnique.mockResolvedValue({ id: ACTOR_ID, isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: MEMBERSHIP_ID,
      status: "ACTIVE",
    });

    const res = await POST_ACCEPT_ID(new Request("http://localhost"), {
      params: Promise.resolve({ id: INVITE_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.alreadyMember).toBe(true);
    expect(mocks.tenantMembershipCreate).not.toHaveBeenCalled();
  });

  it("writes tenant.invite.accepted audit with axes metadata", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindUnique.mockResolvedValue({ ...pendingInviteRow });
    mocks.userFindUnique.mockResolvedValue({ id: ACTOR_ID, isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);

    await POST_ACCEPT_ID(new Request("http://localhost"), {
      params: Promise.resolve({ id: INVITE_ID }),
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant.invite.accepted",
        metadata: expect.objectContaining({
          axes: expect.objectContaining({
            workspaceRole: "MEMBER",
            financialAccess: "OWN_AND_PARTICIPATING",
          }),
        }),
      })
    );
  });

  it("uses invitation tenantId on membership create (isolation)", async () => {
    const otherTenant = "cltenant999999999999";
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindUnique.mockResolvedValue({
      ...pendingInviteRow,
      tenantId: otherTenant,
    });
    mocks.userFindUnique.mockResolvedValue({ id: ACTOR_ID, isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);

    await POST_ACCEPT_ID(new Request("http://localhost"), {
      params: Promise.resolve({ id: INVITE_ID }),
    });
    expect(mocks.tenantMembershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: otherTenant }),
      })
    );
  });
});

describe("POST /api/tenant/invitations/accept token (4-axis)", () => {
  it("creates membership with invitation axes (smoke)", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.tenantInvitationFindFirst.mockResolvedValue({ ...pendingInviteRow });
    mocks.userFindUnique.mockResolvedValue({
      id: ACTOR_ID,
      email: "invitee@example.com",
      isPlatformBlocked: false,
    });
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);

    const token = "x".repeat(32);
    const res = await POST_ACCEPT_TOKEN(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.tenantMembershipCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceRole: "MEMBER",
        financialAccess: "OWN_AND_PARTICIPATING",
      }),
      select: { id: true },
    });
  });
});

describe("GET /api/tenant/invitations (4-axis list)", () => {
  it("returns invitations with 4-axis fields", async () => {
    setupInviteAuth();
    mocks.hasTenantPermission.mockResolvedValue(true);
    mocks.tenantInvitationFindMany.mockResolvedValue([
      {
        id: INVITE_ID,
        email: "a@b.com",
        createdAt: new Date(),
        expiresAt: new Date(),
        acceptedAt: null,
        revokedAt: null,
        workspaceRole: "ADMIN",
        financialAccess: "ALL",
        financeResponsibility: "NONE",
        billingAccess: "READ",
        invitedByUser: null,
      },
    ]);

    const res = await GET_INVITES(new Request("http://localhost"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.invitations[0]).toMatchObject({
      workspaceRole: "ADMIN",
      financialAccess: "ALL",
      financeResponsibility: "NONE",
      billingAccess: "READ",
    });
  });
});
