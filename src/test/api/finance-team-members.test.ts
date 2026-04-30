import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  financeTeamFindFirst: vi.fn(),
  financeTeamMemberFindMany: vi.fn(),
  financeTeamMemberFindFirst: vi.fn(),
  financeTeamMemberCreate: vi.fn(),
  financeTeamMemberUpdate: vi.fn(),
  tenantMembershipFindFirst: vi.fn(),
  tenantMembershipUpdate: vi.fn(),
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

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    financeTeam: { findFirst: mocks.financeTeamFindFirst },
    financeTeamMember: {
      findMany: mocks.financeTeamMemberFindMany,
      findFirst: mocks.financeTeamMemberFindFirst,
      create: mocks.financeTeamMemberCreate,
      update: mocks.financeTeamMemberUpdate,
    },
    tenantMembership: {
      findFirst: mocks.tenantMembershipFindFirst,
      update: mocks.tenantMembershipUpdate,
    },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.$transaction,
  },
}));

import { GET as GET_MEMBERS, POST as POST_MEMBER } from "@/app/api/tenant/finance-teams/[teamId]/members/route";
import {
  PATCH as PATCH_MEMBER,
  DELETE as DELETE_MEMBER,
} from "@/app/api/tenant/finance-teams/[teamId]/members/[memberId]/route";

const TENANT_ID = "cltenant000000000001";
const OTHER_TENANT = "cltenant000000000002";
const ACTOR_ID = "clactor0000000000001";
const TEAM_ID = "clteam00000000000001";
const MEMBER_ID = "clmember000000000001";
const MEMBERSHIP_ID = "clmemshp00000000001";

const baseSession = {
  user: { id: ACTOR_ID, sessionToken: "s" },
};

const userStub = { id: "u1", email: "a@b.co", name: "Alice", image: null as string | null };

function memberPayload(overrides: Partial<{ deletedAt: Date | null; weight: number; isLead: boolean }> = {}) {
  return {
    id: MEMBER_ID,
    membershipId: MEMBERSHIP_ID,
    weight: 100,
    isLead: false,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null as Date | null,
    membership: { userId: "u1", user: userStub },
    ...overrides,
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

function txMockMembers() {
  mocks.$transaction.mockImplementation(
    async (fn: (tx: { financeTeamMember: object; auditLog: object }) => Promise<unknown>) => {
      return fn({
        financeTeamMember: {
          create: mocks.financeTeamMemberCreate,
          update: mocks.financeTeamMemberUpdate,
        },
        auditLog: { create: mocks.auditLogCreate },
      });
    }
  );
}

/** C5 must never persist financeOpenAssignmentsCount via tenantMembership.update. */
function guardTenantMembershipCounter() {
  mocks.tenantMembershipUpdate.mockImplementation(
    (args: { data?: Record<string, unknown> }) => {
      expect(args.data).not.toMatchObject({
        financeOpenAssignmentsCount: expect.anything(),
      });
      return Promise.resolve({
        id: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: "u1",
        financeOpenAssignmentsCount: 0,
      });
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  txMockMembers();
  guardTenantMembershipCounter();
  mocks.auditLogCreate.mockResolvedValue({});
});

describe("POST /api/tenant/finance-teams/[teamId]/members", () => {
  it("201 add member + audit", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "PROCESS",
    });
    mocks.financeTeamMemberFindFirst.mockResolvedValue(null);
    mocks.financeTeamMemberCreate.mockResolvedValue(memberPayload());

    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.data.reactivated).toBe(false);
    expect(j.data.member.membershipId).toBe(MEMBERSHIP_ID);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.finance_team.member_added",
        metadata: expect.objectContaining({
          teamId: TEAM_ID,
          membershipId: MEMBERSHIP_ID,
          reactivated: false,
          weight: 100,
          isLead: false,
        }),
      }),
    });
    expect(mocks.tenantMembershipUpdate).not.toHaveBeenCalled();
  });

  it("201 with weight + isLead", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "PROCESS_AND_APPROVE",
    });
    mocks.financeTeamMemberFindFirst.mockResolvedValue(null);
    mocks.financeTeamMemberCreate.mockResolvedValue(
      memberPayload({ weight: 50, isLead: true })
    );

    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID, weight: 50, isLead: true }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.data.member.weight).toBe(50);
    expect(j.data.member.isLead).toBe(true);
  });

  it("200 reactivates soft-deleted row", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "PROCESS",
    });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      deletedAt: new Date("2025-01-01"),
    });
    mocks.financeTeamMemberUpdate.mockResolvedValue(memberPayload());

    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID, weight: 200 }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.reactivated).toBe(true);
    expect(mocks.financeTeamMemberUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: expect.objectContaining({
        deletedAt: null,
        weight: 200,
        isLead: false,
        addedByUserId: ACTOR_ID,
      }),
      select: expect.any(Object),
    });
  });

  it("400 missing membershipId", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 invalid membershipId", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: "not-a-cuid" }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 membership not found", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue(null);
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 membership other tenant", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: OTHER_TENANT,
      status: "ACTIVE",
      financeResponsibility: "PROCESS",
    });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 membership inactive", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "INVITED",
      financeResponsibility: "PROCESS",
    });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY for APPROVE-only", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "APPROVE",
    });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details?.code).toBe("MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY");
  });

  it("400 MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY for NONE", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "NONE",
    });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details?.code).toBe("MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY");
  });

  it("409 ALREADY_MEMBER when already active", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "PROCESS",
    });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      deletedAt: null,
    });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error.details?.code).toBe("ALREADY_MEMBER");
  });

  it("409 on P2002 race", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.tenantMembershipFindFirst.mockResolvedValue({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      financeResponsibility: "PROCESS",
    });
    mocks.financeTeamMemberFindFirst.mockResolvedValue(null);
    mocks.financeTeamMemberCreate.mockRejectedValue(
      new PrismaClientKnownRequestError("u", { code: "P2002", clientVersion: "x" })
    );
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(409);
  });

  it("401 unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    mocks.requireFullSession.mockResolvedValue(null);
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("403 without permission", async () => {
    setupAuthedManager();
    mocks.hasTenantPermission.mockResolvedValue(false);
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("404 team missing", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("403 platform blocked", async () => {
    setupAuthedManager();
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    const res = await POST_MEMBER(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: MEMBERSHIP_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/tenant/finance-teams/[teamId]/members", () => {
  it("200 lists members with user details", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindMany.mockResolvedValue([memberPayload()]);

    const res = await GET_MEMBERS(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.items).toHaveLength(1);
    expect(j.data.items[0].membership.user.email).toBe("a@b.co");
    expect(mocks.financeTeamMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teamId: TEAM_ID,
          tenantId: TENANT_ID,
          deletedAt: null,
        }),
      })
    );
  });

  it("includeArchived=true omits deletedAt filter", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindMany.mockResolvedValue([]);

    await GET_MEMBERS(new Request("http://localhost?includeArchived=true"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(mocks.financeTeamMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ deletedAt: null }),
      })
    );
  });

  it("404 unknown team", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await GET_MEMBERS(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/tenant/finance-teams/[teamId]/members/[memberId]", () => {
  it("200 updates weight", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      weight: 100,
      isLead: false,
      membershipId: MEMBERSHIP_ID,
      membership: { tenantId: TENANT_ID },
    });
    mocks.financeTeamMemberUpdate.mockResolvedValue(memberPayload({ weight: 80 }));

    const res = await PATCH_MEMBER(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: 80 }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID, memberId: MEMBER_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.finance_team.member_updated",
        metadata: expect.objectContaining({
          teamId: TEAM_ID,
          memberId: MEMBER_ID,
          before: { weight: 100, isLead: false },
          after: { weight: 80, isLead: false },
          fieldsChanged: ["weight"],
        }),
      }),
    });
  });

  it("400 empty body", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      weight: 100,
      isLead: false,
      membershipId: MEMBERSHIP_ID,
      membership: { tenantId: TENANT_ID },
    });
    const res = await PATCH_MEMBER(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID, memberId: MEMBER_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 invalid weight", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      weight: 100,
      isLead: false,
      membershipId: MEMBERSHIP_ID,
      membership: { tenantId: TENANT_ID },
    });
    const res = await PATCH_MEMBER(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: 0 }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID, memberId: MEMBER_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("404 when member soft-deleted", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindFirst.mockResolvedValue(null);
    const res = await PATCH_MEMBER(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: 50 }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID, memberId: MEMBER_ID }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tenant/finance-teams/[teamId]/members/[memberId]", () => {
  it("200 soft removes + audit", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      deletedAt: null,
      membershipId: MEMBERSHIP_ID,
      membership: { tenantId: TENANT_ID },
    });

    const res = await DELETE_MEMBER(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID, memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.financeTeamMemberUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.finance_team.member_removed",
        metadata: {
          teamId: TEAM_ID,
          membershipId: MEMBERSHIP_ID,
          memberId: MEMBER_ID,
        },
      }),
    });
  });

  it("404 already deleted", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID });
    mocks.financeTeamMemberFindFirst.mockResolvedValue({
      id: MEMBER_ID,
      deletedAt: new Date(),
      membershipId: MEMBERSHIP_ID,
      membership: { tenantId: TENANT_ID },
    });
    const res = await DELETE_MEMBER(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID, memberId: MEMBER_ID }),
    });
    expect(res.status).toBe(404);
  });
});
