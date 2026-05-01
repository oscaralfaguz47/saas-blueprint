import { describe, expect, it } from "vitest";
import {
  computeNextStepToUnblock,
  type RoutingParticipantSnapshot,
} from "@/server/services/approval-routing-engine/unblock-next-step";

function p(
  partial: Partial<RoutingParticipantSnapshot> & Pick<RoutingParticipantSnapshot, "id" | "status" | "sequenceOrder">
): RoutingParticipantSnapshot {
  return {
    userId: "u1",
    routingRuleId: "rule1",
    ...partial,
  };
}

describe("computeNextStepToUnblock", () => {
  it("returns null for empty participants", () => {
    expect(computeNextStepToUnblock([])).toBeNull();
  });

  it("returns null when all sequenceOrder values are null (defensive)", () => {
    expect(
      computeNextStepToUnblock([
        {
          id: "1",
          userId: "u1",
          status: "PENDING_BLOCKED",
          sequenceOrder: null,
          routingRuleId: "rule1",
        },
      ])
    ).toBeNull();
  });

  it("returns null when step 1 still has PENDING (not all approved)", () => {
    const out = computeNextStepToUnblock([
      p({ id: "a", status: "PENDING", sequenceOrder: 1 }),
      p({ id: "b", status: "PENDING_BLOCKED", sequenceOrder: 2 }),
    ]);
    expect(out).toBeNull();
  });

  it("returns null when active step has no PENDING_BLOCKED", () => {
    const out = computeNextStepToUnblock([
      p({ id: "a", status: "APPROVED", sequenceOrder: 1 }),
      p({ id: "b", status: "PENDING", sequenceOrder: 2 }),
    ]);
    expect(out).toBeNull();
  });

  it("unblocks step 2 when step 1 fully approved", () => {
    const out = computeNextStepToUnblock([
      p({ id: "a", status: "APPROVED", sequenceOrder: 1 }),
      p({ id: "b", status: "PENDING_BLOCKED", sequenceOrder: 2 }),
    ]);
    expect(out).toEqual({ sequenceOrder: 2, participantIdsToUnblock: ["b"] });
  });

  it("unblocks step 3 when steps 1–2 complete", () => {
    const out = computeNextStepToUnblock([
      p({ id: "a", status: "APPROVED", sequenceOrder: 1 }),
      p({ id: "b", status: "APPROVED", sequenceOrder: 2 }),
      p({ id: "c", status: "PENDING_BLOCKED", sequenceOrder: 3 }),
    ]);
    expect(out).toEqual({ sequenceOrder: 3, participantIdsToUnblock: ["c"] });
  });

  it("returns null when step 1 has PENDING_BLOCKED but step 1 not complete", () => {
    const out = computeNextStepToUnblock([
      p({ id: "a", status: "PENDING", sequenceOrder: 1 }),
      p({ id: "b", status: "PENDING_BLOCKED", sequenceOrder: 1 }),
    ]);
    expect(out).toBeNull();
  });

  it("unblocks multiple participants at same step", () => {
    const out = computeNextStepToUnblock([
      p({ id: "a", status: "APPROVED", sequenceOrder: 1 }),
      p({ id: "b", status: "PENDING_BLOCKED", sequenceOrder: 2 }),
      p({ id: "c", status: "PENDING_BLOCKED", sequenceOrder: 2 }),
    ]);
    expect(out?.sequenceOrder).toBe(2);
    expect(out?.participantIdsToUnblock.sort()).toEqual(["b", "c"]);
  });
});
