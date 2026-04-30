import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeApprovalStatusFromParticipants,
  recomputeApprovalStatus,
} from "@/server/services/record-approval-status";
import type { RecordApprovalStatus, RecordParticipantStatus } from "@prisma/client";

const NOW = new Date("2026-01-15T12:00:00.000Z");

function p(
  status: RecordParticipantStatus,
  opts: { expiresAt?: Date | null; revokedAt?: Date | null } = {}
) {
  return {
    status,
    expiresAt: opts.expiresAt ?? null,
    revokedAt: opts.revokedAt ?? null,
  };
}

describe("computeApprovalStatusFromParticipants", () => {
  it("returns NO_APPROVERS_ASSIGNED when there are no active (non-revoked) approvers", () => {
    expect(computeApprovalStatusFromParticipants([], NOW)).toBe("NO_APPROVERS_ASSIGNED");
    expect(
      computeApprovalStatusFromParticipants(
        [p("PENDING", { revokedAt: new Date("2026-01-01T00:00:00.000Z") })],
        NOW
      )
    ).toBe("NO_APPROVERS_ASSIGNED");
  });

  it("returns APPROVAL_REJECTED if any active approver is REJECTED", () => {
    expect(
      computeApprovalStatusFromParticipants(
        [p("APPROVED"), p("REJECTED"), p("PENDING")],
        NOW
      )
    ).toBe("APPROVAL_REJECTED");
  });

  it("returns FULLY_APPROVED when every active approver is APPROVED", () => {
    expect(computeApprovalStatusFromParticipants([p("APPROVED")], NOW)).toBe(
      "FULLY_APPROVED"
    );
    expect(computeApprovalStatusFromParticipants([p("APPROVED"), p("APPROVED")], NOW)).toBe(
      "FULLY_APPROVED"
    );
  });

  it("returns WAITING_FOR_APPROVAL when there is a non-expired pending approver", () => {
    const future = new Date("2026-01-20T00:00:00.000Z");
    expect(
      computeApprovalStatusFromParticipants([p("PENDING", { expiresAt: future })], NOW)
    ).toBe("WAITING_FOR_APPROVAL");
    expect(
      computeApprovalStatusFromParticipants(
        [p("APPROVED"), p("PENDING", { expiresAt: null })],
        NOW
      )
    ).toBe("WAITING_FOR_APPROVAL");
  });

  it("returns APPROVAL_EXPIRED when every pending approver has a past expiresAt (fixed now)", () => {
    const past = new Date("2026-01-14T00:00:00.000Z");
    expect(computeApprovalStatusFromParticipants([p("PENDING", { expiresAt: past })], NOW)).toBe(
      "APPROVAL_EXPIRED"
    );
    expect(
      computeApprovalStatusFromParticipants(
        [
          p("PENDING", { expiresAt: past }),
          p("PENDING", { expiresAt: new Date("2026-01-15T11:59:59.000Z") }),
        ],
        NOW
      )
    ).toBe("APPROVAL_EXPIRED");
  });

  it("returns WAITING_FOR_APPROVAL when some pending expired but not all (fixed now)", () => {
    const past = new Date("2026-01-14T00:00:00.000Z");
    const future = new Date("2026-01-16T00:00:00.000Z");
    expect(
      computeApprovalStatusFromParticipants(
        [p("PENDING", { expiresAt: past }), p("PENDING", { expiresAt: future })],
        NOW
      )
    ).toBe("WAITING_FOR_APPROVAL");
  });

  it("treats pending without expiresAt as not fully expired", () => {
    const past = new Date("2026-01-14T00:00:00.000Z");
    expect(
      computeApprovalStatusFromParticipants(
        [p("PENDING", { expiresAt: past }), p("PENDING", { expiresAt: null })],
        NOW
      )
    ).toBe("WAITING_FOR_APPROVAL");
  });

  it("ignores revoked rows when computing status", () => {
    expect(
      computeApprovalStatusFromParticipants(
        [
          p("REJECTED", { revokedAt: new Date("2026-01-01T00:00:00.000Z") }),
          p("PENDING"),
        ],
        NOW
      )
    ).toBe("WAITING_FOR_APPROVAL");
  });

  it("returns the same result regardless of participant array order (stability)", () => {
    const a = p("PENDING");
    const b = p("APPROVED");
    expect(computeApprovalStatusFromParticipants([a, b], NOW)).toBe("WAITING_FOR_APPROVAL");
    expect(computeApprovalStatusFromParticipants([b, a], NOW)).toBe("WAITING_FOR_APPROVAL");

    const x = p("PENDING", { expiresAt: new Date("2026-01-14T00:00:00.000Z") });
    const y = p("PENDING", { expiresAt: new Date("2026-01-16T00:00:00.000Z") });
    expect(computeApprovalStatusFromParticipants([x, y], NOW)).toBe("WAITING_FOR_APPROVAL");
    expect(computeApprovalStatusFromParticipants([y, x], NOW)).toBe("WAITING_FOR_APPROVAL");
  });
});

describe("recomputeApprovalStatus", () => {
  const tenantId = "clxxxxxxxxxxxxxxxxxxxxx0";
  const recordId = "clxxxxxxxxxxxxxxxxxxxxx1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildTx() {
    const record = {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    const recordParticipant = {
      findMany: vi.fn(),
    };
    const recordEvent = {
      create: vi.fn().mockResolvedValue({}),
    };
    const auditLog = {
      create: vi.fn().mockResolvedValue({}),
    };
    return {
      record,
      recordParticipant,
      recordEvent,
      auditLog,
    };
  }

  it("throws if record.findFirst returns null (no writes; caller tx can roll back)", async () => {
    const tx = buildTx();
    tx.record.findFirst.mockResolvedValue(null);

    await expect(
      recomputeApprovalStatus(
        tx as never,
        { tenantId, recordId, actorUserId: "u1" }
      )
    ).rejects.toThrow("Record not found for approval recompute");

    expect(tx.record.update).not.toHaveBeenCalled();
    expect(tx.recordEvent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws clearly if actorUserId and record.createdByUserId are both null", async () => {
    const tx = buildTx();
    tx.record.findFirst.mockResolvedValue({
      approvalStatus: "NOT_STARTED",
      createdByUserId: null,
    });
    tx.recordParticipant.findMany.mockResolvedValue([p("APPROVED")]);

    await expect(
      recomputeApprovalStatus(tx as never, {
        tenantId,
        recordId,
        actorUserId: null,
      })
    ).rejects.toThrow("Cannot write approval status audit log: missing actorUserId and record.createdByUserId");

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("uses record.createdByUserId for audit when actorUserId is null", async () => {
    const tx = buildTx();
    tx.record.findFirst.mockResolvedValue({
      approvalStatus: "NOT_STARTED",
      createdByUserId: "creator-1",
    });
    tx.recordParticipant.findMany.mockResolvedValue([p("APPROVED")]);

    const result = await recomputeApprovalStatus(tx as never, {
      tenantId,
      recordId,
      actorUserId: null,
    });

    expect(result.changed).toBe(true);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "creator-1",
        action: "record.approval_status.changed",
      }),
    });
  });

  it("is idempotent: no record update or events when computed status matches DB", async () => {
    const tx = buildTx();
    tx.record.findFirst.mockResolvedValue({
      approvalStatus: "WAITING_FOR_APPROVAL",
      createdByUserId: "u1",
    });
    tx.recordParticipant.findMany.mockResolvedValue([p("PENDING")]);

    const result = await recomputeApprovalStatus(tx as never, {
      tenantId,
      recordId,
      actorUserId: "u1",
    });

    expect(result.changed).toBe(false);
    expect(tx.record.update).not.toHaveBeenCalled();
    expect(tx.recordEvent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("second recompute after a transition emits no additional record events", async () => {
    let approvalStatus: RecordApprovalStatus = "WAITING_FOR_APPROVAL";
    const tx = buildTx();
    tx.record.findFirst.mockImplementation(() =>
      Promise.resolve({ approvalStatus, createdByUserId: "u1" })
    );
    tx.recordParticipant.findMany.mockResolvedValue([p("APPROVED")]);
    tx.record.update.mockImplementation(async () => {
      approvalStatus = "FULLY_APPROVED";
      return {};
    });

    const first = await recomputeApprovalStatus(tx as never, {
      tenantId,
      recordId,
      actorUserId: "u1",
    });
    expect(first.changed).toBe(true);
    const eventsAfterFirst = tx.recordEvent.create.mock.calls.length;

    const second = await recomputeApprovalStatus(tx as never, {
      tenantId,
      recordId,
      actorUserId: "u1",
    });
    expect(second.changed).toBe(false);
    expect(tx.recordEvent.create.mock.calls.length).toBe(eventsAfterFirst);
  });

  it("on transition, writes APPROVAL_STATUS_CHANGED and terminal event + audit", async () => {
    const tx = buildTx();
    tx.record.findFirst.mockResolvedValue({
      approvalStatus: "WAITING_FOR_APPROVAL",
      createdByUserId: "u1",
    });
    tx.recordParticipant.findMany.mockResolvedValue([p("APPROVED")]);

    const result = await recomputeApprovalStatus(tx as never, {
      tenantId,
      recordId,
      triggeredByParticipantId: "part-1",
      triggeredByAction: "INTERNAL_APPROVED",
      actorUserId: "u1",
    });

    expect(result.changed).toBe(true);
    expect(result.isTerminalTransition).toBe(true);
    expect(tx.record.update).toHaveBeenCalled();
    const eventTypes = tx.recordEvent.create.mock.calls.map(
      (c) => c[0].data.eventType
    );
    expect(eventTypes).toContain("APPROVAL_STATUS_CHANGED");
    expect(eventTypes).toContain("APPROVAL_FULLY_COMPLETED");
    expect(eventTypes).not.toContain("APPROVAL_REJECTED_FINAL");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("emits APPROVAL_REJECTED_FINAL on rejection terminal state", async () => {
    const tx = buildTx();
    tx.record.findFirst.mockResolvedValue({
      approvalStatus: "WAITING_FOR_APPROVAL",
      createdByUserId: "u1",
    });
    tx.recordParticipant.findMany.mockResolvedValue([p("REJECTED")]);

    await recomputeApprovalStatus(tx as never, {
      tenantId,
      recordId,
      actorUserId: "u1",
    });

    const eventTypes = tx.recordEvent.create.mock.calls.map(
      (c) => c[0].data.eventType
    );
    expect(eventTypes).toContain("APPROVAL_REJECTED_FINAL");
  });
});
