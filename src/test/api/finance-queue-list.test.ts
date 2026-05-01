import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  userFindUnique: vi.fn(),
  recordFindMany: vi.fn(),
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

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    record: { findMany: mocks.recordFindMany },
  },
}));

import { GET } from "@/app/api/finance/queue/route";

const TENANT_ID = "clxxxxxxxxxxxxxxxxxxxxx4";
const USER_ID = "clxxxxxxxxxxxxxxxxxxxxx5";
const MEMBERSHIP_ID = "clxxxxxxxxxxxxxxxxxxxxx6";
const CURSOR_ID = "clxxxxxxxxxxxxxxxxxxxxx1";

const baseSession = {
  user: { id: USER_ID, sessionToken: "s" },
};

const listRow = {
  id: "rec1",
  recordKey: "REQ-1",
  title: "T",
  type: "OTHER_FINANCIAL_REQUEST" as const,
  status: "OPEN" as const,
  financeStatus: FinanceStatus.ASSIGNED,
  financeAssignedAt: new Date("2026-01-01T00:00:00.000Z"),
  requestedAmount: null,
  currencyCode: null,
  departmentId: null,
  priority: "MEDIUM" as const,
  approvalStatus: "NOT_STARTED" as const,
};

function setupAuthed() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    id: MEMBERSHIP_ID,
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAuthed();
  mocks.recordFindMany.mockResolvedValue([listRow]);
});

describe("GET /api/finance/queue", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/finance/queue"));
    expect(res.status).toBe(401);
  });

  it("returns items for assignee with default ASSIGNED+IN_PROGRESS filter", async () => {
    const res = await GET(new Request("http://localhost/api/finance/queue"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.nextCursor).toBeNull();
    expect(mocks.recordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          financeAssignedMembershipId: MEMBERSHIP_ID,
          financeStatus: { in: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS] },
          financeAssignedAt: { not: null },
        }),
        orderBy: [{ financeAssignedAt: "desc" }, { id: "desc" }],
      })
    );
  });

  it("parses comma-separated status filter", async () => {
    await GET(
      new Request(
        `http://localhost/api/finance/queue?status=${FinanceStatus.COMPLETED},${FinanceStatus.ASSIGNED}`
      )
    );
    expect(mocks.recordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          financeStatus: { in: [FinanceStatus.COMPLETED, FinanceStatus.ASSIGNED] },
        }),
      })
    );
  });

  it("returns 400 for invalid status filter", async () => {
    const res = await GET(new Request("http://localhost/api/finance/queue?status=NOT_A_STATUS"));
    expect(res.status).toBe(400);
  });

  it("cursor pagination passes cursor and skip", async () => {
    mocks.recordFindMany.mockResolvedValue([listRow, { ...listRow, id: "clxxxxxxxxxxxxxxxxxxxxx2" }]);
    await GET(new Request(`http://localhost/api/finance/queue?cursor=${CURSOR_ID}`));
    expect(mocks.recordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: CURSOR_ID },
        skip: 1,
        take: 26,
      })
    );
  });

  it("returns 403 when platform blocked", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    const res = await GET(new Request("http://localhost/api/finance/queue"));
    expect(res.status).toBe(403);
  });
});
