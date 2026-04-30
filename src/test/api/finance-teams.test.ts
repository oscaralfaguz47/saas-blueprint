import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  financeTeamFindMany: vi.fn(),
  financeTeamFindFirst: vi.fn(),
  financeTeamCreate: vi.fn(),
  financeTeamUpdate: vi.fn(),
  tenantDepartmentFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  financeTeamMemberUpdate: vi.fn(),
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
    financeTeam: {
      findMany: mocks.financeTeamFindMany,
      findFirst: mocks.financeTeamFindFirst,
      create: mocks.financeTeamCreate,
      update: mocks.financeTeamUpdate,
    },
    financeTeamMember: {
      update: mocks.financeTeamMemberUpdate,
    },
    tenantDepartment: { findFirst: mocks.tenantDepartmentFindFirst },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.$transaction,
  },
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/tenant/finance-teams/route";
import {
  GET as GET_DETAIL,
  PATCH as PATCH_TEAM,
  DELETE as DELETE_TEAM,
} from "@/app/api/tenant/finance-teams/[teamId]/route";

const TENANT_ID = "cltenant000000000001";
const ACTOR_ID = "clactor0000000000001";
const TEAM_ID = "clteam00000000000001";
const DEPT_ID = "cldept00000000000001";

const baseSession = {
  user: { id: ACTOR_ID, sessionToken: "s" },
};

const teamRow = {
  id: TEAM_ID,
  name: "Payables",
  description: null as string | null,
  departmentId: null as string | null,
  isActive: true,
  timeZone: null as string | null,
  maxConcurrentAssignments: null as number | null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  deletedAt: null as Date | null,
  _count: { members: 0 },
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
    async (fn: (tx: { financeTeam: object; auditLog: object }) => Promise<unknown>) => {
      return fn({
        financeTeam: {
          create: mocks.financeTeamCreate,
          update: mocks.financeTeamUpdate,
        },
        auditLog: { create: mocks.auditLogCreate },
      });
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock();
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.financeTeamMemberUpdate.mockResolvedValue({});
});

describe("POST /api/tenant/finance-teams", () => {
  it("201 creates team and audit inside tx", async () => {
    setupAuthedManager();
    mocks.tenantDepartmentFindFirst.mockResolvedValue(null);
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    mocks.financeTeamCreate.mockResolvedValue(teamRow);

    const res = await POST_CREATE(
      new Request("http://localhost/api/tenant/finance-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Payables" }),
      })
    );
    expect(res.status).toBe(201);
    expect(mocks.financeTeamCreate).toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.finance_team.created",
        metadata: { name: "Payables", departmentId: null },
      }),
    });
    expect(mocks.financeTeamMemberUpdate).not.toHaveBeenCalled();
  });

  it("201 with departmentId when department in tenant", async () => {
    setupAuthedManager();
    mocks.tenantDepartmentFindFirst.mockResolvedValue({ id: DEPT_ID });
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    mocks.financeTeamCreate.mockResolvedValue({
      ...teamRow,
      departmentId: DEPT_ID,
    });

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "A",
          departmentId: DEPT_ID,
          description: "d",
          timeZone: "UTC",
          maxConcurrentAssignments: 5,
          isActive: true,
        }),
      })
    );
    expect(res.status).toBe(201);
  });

  it("400 when name missing", async () => {
    setupAuthedManager();
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 when name too long", async () => {
    setupAuthedManager();
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x".repeat(121) }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("409 when duplicate name (pre-check)", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: "other" });

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Dup" }),
      })
    );
    expect(res.status).toBe(409);
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("409 on P2002 from create", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    mocks.financeTeamCreate.mockRejectedValue(
      new PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "x" })
    );

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      })
    );
    expect(res.status).toBe(409);
  });

  it("404 when department not in tenant", async () => {
    setupAuthedManager();
    mocks.tenantDepartmentFindFirst.mockResolvedValue(null);
    mocks.financeTeamFindFirst.mockResolvedValue(null);

    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A", departmentId: DEPT_ID }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("400 when maxConcurrentAssignments invalid", async () => {
    setupAuthedManager();
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A", maxConcurrentAssignments: 0 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("401 unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    mocks.requireFullSession.mockResolvedValue(null);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("403 without financial_config.manage", async () => {
    setupAuthedManager();
    mocks.hasTenantPermission.mockResolvedValue(false);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("403 NO_TENANT", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.getDefaultTenantForUser.mockResolvedValue(null);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/tenant/finance-teams", () => {
  it("returns items and nextCursor", async () => {
    setupAuthedManager();
    const rows = [
      { ...teamRow, id: "a", createdAt: new Date("2026-01-03T00:00:00.000Z") },
      { ...teamRow, id: "b", createdAt: new Date("2026-01-02T00:00:00.000Z") },
    ];
    mocks.financeTeamFindMany.mockResolvedValue(rows);

    const res = await GET_LIST(new Request("http://localhost?limit=1"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.items).toHaveLength(1);
    expect(j.data.nextCursor).toBeTruthy();
    expect(mocks.financeTeamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID, deletedAt: null }),
      })
    );
  });

  it("includeArchived omits deletedAt null filter", async () => {
    setupAuthedManager();
    mocks.financeTeamFindMany.mockResolvedValue([]);

    await GET_LIST(new Request("http://localhost?includeArchived=true"));
    expect(mocks.financeTeamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ deletedAt: null }),
      })
    );
  });

  it("filters departmentId and search", async () => {
    setupAuthedManager();
    mocks.financeTeamFindMany.mockResolvedValue([]);

    await GET_LIST(
      new Request(`http://localhost?departmentId=${DEPT_ID}&search=pay`)
    );
    expect(mocks.financeTeamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departmentId: DEPT_ID,
          name: { contains: "pay", mode: "insensitive" },
        }),
      })
    );
  });

  it("uses _count members with deletedAt null", async () => {
    setupAuthedManager();
    mocks.financeTeamFindMany.mockResolvedValue([]);

    await GET_LIST(new Request("http://localhost"));
    expect(mocks.financeTeamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              members: { where: { deletedAt: null } },
            },
          },
        }),
      })
    );
  });

  it("403 without permission", async () => {
    setupAuthedManager();
    mocks.hasTenantPermission.mockResolvedValue(false);
    const res = await GET_LIST(new Request("http://localhost"));
    expect(res.status).toBe(403);
  });

  it("400 invalid query params", async () => {
    setupAuthedManager();
    const res = await GET_LIST(new Request("http://localhost?limit=0"));
    expect(res.status).toBe(400);
  });

  it("cursor pagination encodes nextCursor from last row", async () => {
    setupAuthedManager();
    const d = new Date("2026-06-01T12:00:00.000Z");
    mocks.financeTeamFindMany.mockResolvedValue([
      { ...teamRow, id: "t1", createdAt: d },
      { ...teamRow, id: "t2", createdAt: new Date("2026-05-01T00:00:00.000Z") },
    ]);

    const res = await GET_LIST(new Request("http://localhost?limit=1"));
    const j = await res.json();
    expect(j.data.items[0].id).toBe("t1");
    const dec = JSON.parse(
      Buffer.from(j.data.nextCursor, "base64url").toString("utf8")
    ) as { id: string; sortValue: string };
    expect(dec.id).toBe("t1");
    expect(dec.sortValue).toBe(d.toISOString());
  });
});

describe("GET /api/tenant/finance-teams/[teamId]", () => {
  it("200 with memberCount", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({
      ...teamRow,
      _count: { members: 3 },
    });

    const res = await GET_DETAIL(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.memberCount).toBe(3);
  });

  it("404 not found", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await GET_DETAIL(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("404 cross-tenant (no row)", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await GET_DETAIL(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: "clothertenantteam0001" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/tenant/finance-teams/[teamId]", () => {
  it("200 updates and audit inside tx", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst
      .mockResolvedValueOnce({
        id: TEAM_ID,
        name: "Old",
        description: null,
        departmentId: null,
        isActive: true,
        timeZone: null,
        maxConcurrentAssignments: null,
      })
      .mockResolvedValueOnce(null);
    mocks.financeTeamUpdate.mockResolvedValue({
      ...teamRow,
      name: "New",
    });

    const res = await PATCH_TEAM(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New" }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.finance_team.updated",
        metadata: expect.objectContaining({
          fieldsChanged: ["name"],
          before: expect.objectContaining({ name: "Old" }),
          after: expect.objectContaining({ name: "New" }),
        }),
      }),
    });
  });

  it("400 empty patch", async () => {
    setupAuthedManager();
    const res = await PATCH_TEAM(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("409 duplicate name on patch", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst
      .mockResolvedValueOnce({
        id: TEAM_ID,
        name: "Old",
        description: null,
        departmentId: null,
        isActive: true,
        timeZone: null,
        maxConcurrentAssignments: null,
      })
      .mockResolvedValueOnce({ id: "other" });

    const res = await PATCH_TEAM(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Taken" }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(409);
  });

  it("200 partial description only", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({
      id: TEAM_ID,
      name: "Old",
      description: null,
      departmentId: null,
      isActive: true,
      timeZone: null,
      maxConcurrentAssignments: null,
    });
    mocks.financeTeamUpdate.mockResolvedValue({
      ...teamRow,
      description: "Hi",
    });

    const res = await PATCH_TEAM(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Hi" }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          fieldsChanged: ["description"],
        }),
      }),
    });
  });

  it("404 bad department on patch", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({
      id: TEAM_ID,
      name: "Old",
      description: null,
      departmentId: null,
      isActive: true,
      timeZone: null,
      maxConcurrentAssignments: null,
    });
    mocks.tenantDepartmentFindFirst.mockResolvedValue(null);

    const res = await PATCH_TEAM(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: DEPT_ID }),
      }),
      { params: Promise.resolve({ teamId: TEAM_ID }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tenant/finance-teams/[teamId]", () => {
  it("soft deletes and audit in tx; does not touch FinanceTeamMember", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue({ id: TEAM_ID, name: "N" });
    mocks.financeTeamUpdate.mockResolvedValue({});

    const res = await DELETE_TEAM(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.financeTeamUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEAM_ID },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedByUserId: ACTOR_ID,
        }),
      })
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.finance_team.deleted",
        metadata: { name: "N" },
      }),
    });
    expect(mocks.financeTeamMemberUpdate).not.toHaveBeenCalled();
  });

  it("404 second delete", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await DELETE_TEAM(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: TEAM_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("404 delete when team in other tenant", async () => {
    setupAuthedManager();
    mocks.financeTeamFindFirst.mockResolvedValue(null);
    const res = await DELETE_TEAM(new Request("http://localhost"), {
      params: Promise.resolve({ teamId: "clteamothertenant0001" }),
    });
    expect(res.status).toBe(404);
    expect(mocks.financeTeamUpdate).not.toHaveBeenCalled();
  });
});

describe("403 platform blocked", () => {
  it("POST 403 when platform blocked", async () => {
    mocks.getServerSession.mockResolvedValue(baseSession);
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    mocks.getDefaultTenantForUser.mockResolvedValue({
      tenant: { id: TENANT_ID, name: "T", slug: "t" },
    });
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("includeArchived query schema", () => {
  it("parses false when param omitted", async () => {
    const { financeTeamListQuerySchema } = await import("@/lib/validations/finance-team");
    const a = financeTeamListQuerySchema.parse({});
    expect(a.includeArchived).toBe(false);
  });

  it("parses true only for literal true", async () => {
    const { financeTeamListQuerySchema } = await import("@/lib/validations/finance-team");
    expect(financeTeamListQuerySchema.parse({ includeArchived: "true" }).includeArchived).toBe(
      true
    );
    expect(financeTeamListQuerySchema.parse({ includeArchived: "false" }).includeArchived).toBe(
      false
    );
  });
});
