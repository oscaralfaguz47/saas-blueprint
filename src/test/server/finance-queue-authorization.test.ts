import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenantMembershipFindUnique: vi.fn(),
  recordFindFirst: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) => {
      const store = new Map<string, R>();
      return ((...args: A): R => {
        const key = JSON.stringify(args);
        if (!store.has(key)) {
          store.set(key, fn(...args));
        }
        return store.get(key) as R;
      }) as (...args: A) => R;
    },
  };
});

vi.mock("@/server/db", () => ({
  prisma: {
    tenantMembership: { findUnique: mocks.tenantMembershipFindUnique },
    record: { findFirst: mocks.recordFindFirst },
  },
}));

import {
  isAssignedToCurrentUser,
  requireFinanceQueueAssignee,
} from "@/server/security/finance-queue-authorization";

const TENANT = "t1";
const USER = "u1";
const MEM = "m1";
/** Distinct recordIds per test so React cache() does not leak outcomes across cases. */
const REC_OK = "r-ok";
const REC_OTHER = "r-other";
const REC_NOMEM = "r-nomem";
const REC_NOREC = "r-norec";
const REC_DEDUP = "r-dedup";

describe("finance-queue-authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isAssignedToCurrentUser returns true when membership matches assignee", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue({ financeAssignedMembershipId: MEM });
    await expect(
      isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: REC_OK })
    ).resolves.toBe(true);
  });

  it("isAssignedToCurrentUser returns false when not assignee", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue({ financeAssignedMembershipId: "other" });
    await expect(
      isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: REC_OTHER })
    ).resolves.toBe(false);
  });

  it("isAssignedToCurrentUser returns false when membership missing or inactive", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);
    await expect(
      isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: REC_NOMEM })
    ).resolves.toBe(false);

    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "DISABLED" });
    await expect(
      isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: `${REC_NOMEM}-2` })
    ).resolves.toBe(false);
  });

  it("isAssignedToCurrentUser returns false when record missing", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue(null);
    await expect(
      isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: REC_NOREC })
    ).resolves.toBe(false);
  });

  it("isAssignedToCurrentUser dedupes via cache for identical args", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue({ financeAssignedMembershipId: MEM });
    await isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: REC_DEDUP });
    await isAssignedToCurrentUser({ tenantId: TENANT, userId: USER, recordId: REC_DEDUP });
    expect(mocks.tenantMembershipFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.recordFindFirst).toHaveBeenCalledTimes(1);
  });

  it("requireFinanceQueueAssignee returns membershipId when assignee", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue({ financeAssignedMembershipId: MEM });
    const out = await requireFinanceQueueAssignee({
      tenantId: TENANT,
      userId: USER,
      recordId: REC_OK,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.membershipId).toBe(MEM);
  });

  it("requireFinanceQueueAssignee returns 404 when record not in tenant", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue(null);
    const out = await requireFinanceQueueAssignee({
      tenantId: TENANT,
      userId: USER,
      recordId: REC_NOREC,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.response.status).toBe(404);
  });

  it("requireFinanceQueueAssignee returns 403 when not assignee", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({ id: MEM, status: "ACTIVE" });
    mocks.recordFindFirst.mockResolvedValue({ financeAssignedMembershipId: "other" });
    const out = await requireFinanceQueueAssignee({
      tenantId: TENANT,
      userId: USER,
      recordId: REC_OTHER,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.response.status).toBe(403);
  });
});
