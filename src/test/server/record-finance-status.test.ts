import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceStatus } from "@prisma/client";

import { recomputeFinanceStatus } from "@/server/services/record-finance-status";

const mocks = vi.hoisted(() => ({
  recordFindFirst: vi.fn(),
  recordUpdateMany: vi.fn(),
  tenantMembershipUpdate: vi.fn(),
}));

const tx = {
  record: {
    findFirst: mocks.recordFindFirst,
    updateMany: mocks.recordUpdateMany,
  },
  tenantMembership: {
    update: mocks.tenantMembershipUpdate,
  },
};

const TENANT = "t1";
const REC = "r1";
const MEM_A = "mA";
const MEM_B = "mB";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordFindFirst.mockResolvedValue({
    financeStatus: FinanceStatus.ASSIGNED,
    financeAssignedMembershipId: MEM_A,
  });
  mocks.recordUpdateMany.mockResolvedValue({ count: 1 });
  mocks.tenantMembershipUpdate.mockResolvedValue({});
});

describe("recomputeFinanceStatus", () => {
  it("start-style: ASSIGNED → IN_PROGRESS, no counters", async () => {
    const out = await recomputeFinanceStatus(tx as never, {
      tenantId: TENANT,
      recordId: REC,
      newStatus: FinanceStatus.IN_PROGRESS,
      expectFromStatus: FinanceStatus.ASSIGNED,
      expectFromAssignee: MEM_A,
    });
    expect(mocks.recordUpdateMany).toHaveBeenCalledWith({
      where: {
        id: REC,
        tenantId: TENANT,
        financeStatus: FinanceStatus.ASSIGNED,
        financeAssignedMembershipId: MEM_A,
      },
      data: { financeStatus: FinanceStatus.IN_PROGRESS },
    });
    expect(mocks.tenantMembershipUpdate).not.toHaveBeenCalled();
    expect(out.changed).toBe(true);
    expect(out.newAssigneeId).toBe(MEM_A);
  });

  it("complete-style: → COMPLETED with decrement", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.IN_PROGRESS,
      financeAssignedMembershipId: MEM_A,
    });
    await recomputeFinanceStatus(tx as never, {
      tenantId: TENANT,
      recordId: REC,
      newStatus: FinanceStatus.COMPLETED,
      expectFromStatus: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS],
      expectFromAssignee: MEM_A,
      decrementMembershipId: MEM_A,
    });
    expect(mocks.recordUpdateMany).toHaveBeenCalledWith({
      where: {
        id: REC,
        tenantId: TENANT,
        financeStatus: { in: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS] },
        financeAssignedMembershipId: MEM_A,
      },
      data: { financeStatus: FinanceStatus.COMPLETED },
    });
    expect(mocks.tenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: MEM_A, tenantId: TENANT },
      data: { financeOpenAssignmentsCount: { decrement: 1 } },
    });
  });

  it("release-style: → PENDING_ASSIGNMENT clears assignee + decrement; result newAssigneeId null", async () => {
    const out = await recomputeFinanceStatus(tx as never, {
      tenantId: TENANT,
      recordId: REC,
      newStatus: FinanceStatus.PENDING_ASSIGNMENT,
      newAssigneeId: null,
      newAssignedAt: null,
      newAssignedByRuleId: null,
      expectFromStatus: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS],
      expectFromAssignee: MEM_A,
      decrementMembershipId: MEM_A,
    });
    expect(mocks.recordUpdateMany).toHaveBeenCalledWith({
      where: {
        id: REC,
        tenantId: TENANT,
        financeStatus: { in: [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS] },
        financeAssignedMembershipId: MEM_A,
      },
      data: {
        financeStatus: FinanceStatus.PENDING_ASSIGNMENT,
        financeAssignedMembershipId: null,
        financeAssignedAt: null,
        financeAssignedByRuleId: null,
      },
    });
    expect(out.newAssigneeId).toBeNull();
    expect(out.previousAssigneeId).toBe(MEM_A);
  });

  it("direct reassign-style: swap with decrement + increment; assignee-only CAS", async () => {
    await recomputeFinanceStatus(tx as never, {
      tenantId: TENANT,
      recordId: REC,
      newStatus: FinanceStatus.ASSIGNED,
      newAssigneeId: MEM_B,
      newAssignedAt: new Date(0),
      newAssignedByRuleId: null,
      expectFromAssignee: MEM_A,
      decrementMembershipId: MEM_A,
      incrementMembershipId: MEM_B,
    });
    expect(mocks.recordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: REC,
          tenantId: TENANT,
          financeAssignedMembershipId: MEM_A,
        },
        data: expect.objectContaining({
          financeStatus: FinanceStatus.ASSIGNED,
          financeAssignedMembershipId: MEM_B,
          financeAssignedByRuleId: null,
        }),
      })
    );
    expect(mocks.tenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: MEM_A, tenantId: TENANT },
      data: { financeOpenAssignmentsCount: { decrement: 1 } },
    });
    expect(mocks.tenantMembershipUpdate).toHaveBeenCalledWith({
      where: { id: MEM_B, tenantId: TENANT },
      data: { financeOpenAssignmentsCount: { increment: 1 } },
    });
  });

  it("unassigned → ASSIGNED: increment only (no decrement)", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.PENDING_ASSIGNMENT,
      financeAssignedMembershipId: null,
    });
    await recomputeFinanceStatus(tx as never, {
      tenantId: TENANT,
      recordId: REC,
      newStatus: FinanceStatus.ASSIGNED,
      newAssigneeId: MEM_B,
      newAssignedAt: new Date(),
      newAssignedByRuleId: null,
      expectFromAssignee: null,
      incrementMembershipId: MEM_B,
    });
    const decCalls = mocks.tenantMembershipUpdate.mock.calls.filter(
      (c) => "decrement" in ((c[0] as { data: object }).data as object)
    );
    expect(decCalls.length).toBe(0);
  });

  it("throws INVALID_STATE_TRANSITION when updateMany count !== 1", async () => {
    mocks.recordUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      recomputeFinanceStatus(tx as never, {
        tenantId: TENANT,
        recordId: REC,
        newStatus: FinanceStatus.IN_PROGRESS,
        expectFromStatus: FinanceStatus.ASSIGNED,
        expectFromAssignee: MEM_A,
      })
    ).rejects.toMatchObject({
      reason: "INVALID_STATE_TRANSITION",
    });
  });

  it("throws RECORD_NOT_FOUND when row missing", async () => {
    mocks.recordFindFirst.mockResolvedValue(null);
    await expect(
      recomputeFinanceStatus(tx as never, {
        tenantId: TENANT,
        recordId: REC,
        newStatus: FinanceStatus.IN_PROGRESS,
      })
    ).rejects.toMatchObject({
      reason: "RECORD_NOT_FOUND",
    });
  });

  it("changed is false when status unchanged (assignee may still update)", async () => {
    mocks.recordFindFirst.mockResolvedValue({
      financeStatus: FinanceStatus.ASSIGNED,
      financeAssignedMembershipId: MEM_A,
    });
    const out = await recomputeFinanceStatus(tx as never, {
      tenantId: TENANT,
      recordId: REC,
      newStatus: FinanceStatus.ASSIGNED,
      newAssigneeId: MEM_B,
      newAssignedAt: new Date(0),
      newAssignedByRuleId: null,
      expectFromAssignee: MEM_A,
      incrementMembershipId: MEM_B,
    });
    expect(out.changed).toBe(false);
    expect(out.newAssigneeId).toBe(MEM_B);
  });

  it("increment throws after updateMany and decrement (handler tx must roll back in production)", async () => {
    let updateCalls = 0;
    mocks.tenantMembershipUpdate.mockImplementation(
      async (args: { data: { financeOpenAssignmentsCount?: object } }) => {
        updateCalls += 1;
        const c = args.data.financeOpenAssignmentsCount;
        if (c && "increment" in c) {
          throw new Error("increment_failed");
        }
        return {};
      }
    );
    await expect(
      recomputeFinanceStatus(tx as never, {
        tenantId: TENANT,
        recordId: REC,
        newStatus: FinanceStatus.ASSIGNED,
        newAssigneeId: MEM_B,
        newAssignedAt: new Date(),
        newAssignedByRuleId: null,
        expectFromAssignee: MEM_A,
        decrementMembershipId: MEM_A,
        incrementMembershipId: MEM_B,
      })
    ).rejects.toThrow("increment_failed");
    expect(mocks.recordUpdateMany).toHaveBeenCalledTimes(1);
    expect(updateCalls).toBe(2);
  });
});
