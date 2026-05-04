import { describe, expect, it } from "vitest";

import {
  buildRecordApprovalCompletedData,
  buildRecordApprovalRequestedData,
  buildRecordClosedData,
  buildRecordCreatedData,
  buildRecordFinanceAssignedData,
  buildRecordPaymentStatusChangedData,
} from "@/server/webhooks/event-builders";

describe("event builders", () => {
  it("buildRecordCreatedData shapes fields", () => {
    const at = new Date("2026-01-02T03:04:05.000Z");
    const d = buildRecordCreatedData({
      id: "r1",
      title: "T",
      type: "BUDGET",
      status: "OPEN",
      createdAt: at,
      createdByUserId: "u1",
      recordKey: "REQ-2026-000001",
    });
    expect(d).toMatchObject({
      id: "r1",
      name: "T",
      type: "BUDGET",
      status: "OPEN",
      createdByUserId: "u1",
      recordKey: "REQ-2026-000001",
    });
    expect(d.createdAt).toBe(at.toISOString());
  });

  it("buildRecordFinanceAssignedData has no email fields", () => {
    const d = buildRecordFinanceAssignedData({
      recordId: "r1",
      assignedToUserId: "u2",
      membershipId: "m1",
      ruleId: "rule1",
      ruleName: "R",
      evaluationId: "e1",
      assignedAt: new Date(0),
      strategy: "ROUND_ROBIN",
    });
    expect(JSON.stringify(d)).not.toMatch(/email/i);
    expect(d).toMatchObject({
      recordId: "r1",
      assignedToUserId: "u2",
      membershipId: "m1",
    });
  });

  it("buildRecordApprovalRequestedData maps approvers", () => {
    const d = buildRecordApprovalRequestedData({
      recordId: "r1",
      ruleId: "rule1",
      evaluationId: "ev1",
      requestedAt: new Date(0),
      approvers: [
        { userId: "u1", sequenceOrder: 1, routingApproverId: "ra1" },
      ],
    });
    expect((d.approvers as unknown[]).length).toBe(1);
  });

  it("buildRecordApprovalCompletedData maps participant rows", () => {
    const d = buildRecordApprovalCompletedData({
      recordId: "r1",
      completedAt: new Date(0),
      approvers: [
        { participantId: "p1", userId: "u1", status: "APPROVED" },
      ],
    });
    expect(d.approvers).toEqual([
      { participantId: "p1", userId: "u1", status: "APPROVED" },
    ]);
  });

  it("buildRecordPaymentStatusChangedData", () => {
    const d = buildRecordPaymentStatusChangedData({
      recordId: "r1",
      paymentId: "pay1",
      previousStatus: "PENDING",
      newStatus: "PAID",
      changedAt: new Date(0),
    });
    expect(d.previousStatus).toBe("PENDING");
    expect(d.newStatus).toBe("PAID");
  });

  it("buildRecordClosedData", () => {
    const d = buildRecordClosedData({
      recordId: "r1",
      closedAt: new Date(0),
      closedByUserId: "u9",
    });
    expect(d.closedByUserId).toBe("u9");
  });
});
