import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybeUnblockNextApprovalStep } from "@/server/services/approval-unblock-hook";

const unblockNextStepIfReady = vi.hoisted(() => vi.fn());
const recomputeApprovalStatus = vi.hoisted(() => vi.fn());
const createNotification = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/approval-routing-engine/unblock-next-step", () => ({
  unblockNextStepIfReady: unblockNextStepIfReady,
}));

vi.mock("@/server/services/record-approval-status", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/record-approval-status")>(
    "@/server/services/record-approval-status"
  );
  return {
    ...actual,
    recomputeApprovalStatus: recomputeApprovalStatus,
  };
});

vi.mock("@/server/services/notifications/notification-service", () => ({
  createNotification: createNotification,
}));

describe("maybeUnblockNextApprovalStep", () => {
  const reconcileOk = {
    changed: true,
    newStatus: "WAITING_FOR_APPROVAL" as const,
  };

  const ctxBase = {
    tenantId: "t1",
    recordId: "r1",
    actorUserId: "actor1",
    triggeredByParticipantId: "p1",
    triggeredByAction: "INTERNAL_APPROVED" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    recomputeApprovalStatus.mockResolvedValue({
      previousStatus: "WAITING_FOR_APPROVAL",
      newStatus: "WAITING_FOR_APPROVAL",
      changed: false,
      isTerminalTransition: false,
    });
  });

  function createMockDb() {
    return {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return await fn({});
      }),
      record: {
        findFirst: vi.fn().mockResolvedValue({ title: "T" }),
      },
    };
  }

  it("still attempts unblock when reconcile.changed is false but approve trigger (sequential WAITING→WAITING)", async () => {
    unblockNextStepIfReady.mockResolvedValue({
      unblockedCount: 0,
      unblockedRows: [],
      sequenceOrder: null,
      routingRuleId: null,
    });
    const db = createMockDb();
    const out = await maybeUnblockNextApprovalStep(
      db as never,
      { changed: false, newStatus: "WAITING_FOR_APPROVAL" },
      ctxBase
    );
    expect(out.unblockedCount).toBe(0);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("returns 0 when newStatus is terminal", async () => {
    const db = createMockDb();
    const out = await maybeUnblockNextApprovalStep(db as never, { changed: true, newStatus: "FULLY_APPROVED" }, ctxBase);
    expect(out.unblockedCount).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("returns 0 for non-approve triggers (whitelist)", async () => {
    const db = createMockDb();
    const out = await maybeUnblockNextApprovalStep(db as never, reconcileOk, {
      ...ctxBase,
      triggeredByAction: "PARTICIPANT_CREATED",
    });
    expect(out.unblockedCount).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("returns 0 when actorUserId missing", async () => {
    const db = createMockDb();
    const out = await maybeUnblockNextApprovalStep(db as never, reconcileOk, {
      ...ctxBase,
      actorUserId: null,
    });
    expect(out.unblockedCount).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("runs unblock + recompute + notifications on happy path", async () => {
    unblockNextStepIfReady.mockResolvedValue({
      unblockedCount: 1,
      unblockedRows: [{ id: "x", userId: "u1", sequenceOrder: 2, routingRuleId: "rule" }],
      sequenceOrder: 2,
      routingRuleId: "rule",
    });
    const db = createMockDb();
    db.record.findFirst = vi.fn().mockResolvedValue({ title: "My record" });

    const out = await maybeUnblockNextApprovalStep(db as never, reconcileOk, ctxBase);
    expect(out.unblockedCount).toBe(1);
    expect(unblockNextStepIfReady).toHaveBeenCalled();
    expect(recomputeApprovalStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        triggeredByAction: "SEQUENTIAL_STEP_UNBLOCKED",
        tenantId: "t1",
        recordId: "r1",
      })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        type: "RECORD_APPROVAL_REQUESTED",
      })
    );
  });

  it("skips recompute and notifications when unblockedCount is 0", async () => {
    unblockNextStepIfReady.mockResolvedValue({
      unblockedCount: 0,
      unblockedRows: [],
      sequenceOrder: null,
      routingRuleId: null,
    });
    const db = createMockDb();
    const out = await maybeUnblockNextApprovalStep(db as never, reconcileOk, ctxBase);
    expect(out.unblockedCount).toBe(0);
    expect(recomputeApprovalStatus).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("notification failure does not throw", async () => {
    unblockNextStepIfReady.mockResolvedValue({
      unblockedCount: 1,
      unblockedRows: [{ id: "x", userId: "u1", sequenceOrder: 2, routingRuleId: "rule" }],
      sequenceOrder: 2,
      routingRuleId: "rule",
    });
    createNotification.mockRejectedValue(new Error("notify boom"));
    const db = createMockDb();
    db.record.findFirst = vi.fn().mockResolvedValue({ title: "T" });

    await expect(maybeUnblockNextApprovalStep(db as never, reconcileOk, ctxBase)).resolves.toEqual({
      unblockedCount: 1,
    });
  });

  it("transaction failure does not throw", async () => {
    const db = {
      $transaction: vi.fn().mockRejectedValue(new Error("tx boom")),
    };
    const out = await maybeUnblockNextApprovalStep(db as never, reconcileOk, ctxBase);
    expect(out.unblockedCount).toBe(0);
  });
});
