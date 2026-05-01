import { describe, expect, it } from "vitest";
import { leastLoaded } from "@/server/services/finance-assignment-engine/strategies/least-loaded";
import { roundRobin } from "@/server/services/finance-assignment-engine/strategies/round-robin";
import { roundRobinThenLeast } from "@/server/services/finance-assignment-engine/strategies/round-robin-then-least";
import { specificMember } from "@/server/services/finance-assignment-engine/strategies/specific-member";
import { teamLead } from "@/server/services/finance-assignment-engine/strategies/team-lead";
import type { Candidate, StrategyContext } from "@/server/services/finance-assignment-engine/strategies/types";
import {
  FinanceResponsibility,
  MembershipAvailability,
  MembershipStatus,
} from "@prisma/client";

function mem(
  id: string,
  opts: Partial<{
    weight: number;
    load: number;
    isLead: boolean;
    joinedAt: Date;
    userId: string;
  }> = {}
): Candidate {
  const joinedAt = opts.joinedAt ?? new Date("2024-06-01");
  return {
    id: `ftm-${id}`,
    tenantId: "t1",
    teamId: "team1",
    membershipId: id,
    weight: opts.weight ?? 100,
    isLead: opts.isLead ?? false,
    joinedAt,
    addedByUserId: null,
    deletedAt: null,
    membership: {
      id,
      userId: opts.userId ?? `u-${id}`,
      financeOpenAssignmentsCount: opts.load ?? 0,
      availability: MembershipAvailability.AVAILABLE,
      status: MembershipStatus.ACTIVE,
      financeResponsibility: FinanceResponsibility.PROCESS_AND_APPROVE,
      user: { name: id, email: `${id}@t` },
    },
  };
}

const baseCtx = (): StrategyContext => ({
  ruleId: "rule1",
  teamId: "team1",
  tenantId: "t1",
  specificMembershipId: null,
  maxConcurrentAssignments: null,
  recentAssignmentsForTeam: [],
});

describe("specificMember", () => {
  it("picks configured membership when eligible", () => {
    const a = mem("m-a");
    const b = mem("m-b");
    const ctx = { ...baseCtx(), specificMembershipId: "m-b" };
    const r = specificMember([a, b], ctx);
    expect(r.winner?.membershipId).toBe("m-b");
  });

  it("returns null when specific id not in eligible set", () => {
    const r = specificMember([mem("m-a")], { ...baseCtx(), specificMembershipId: "m-b" });
    expect(r.winner).toBeNull();
  });
});

describe("teamLead", () => {
  it("returns earliest joined lead", () => {
    const a = mem("m-a", { isLead: true, joinedAt: new Date("2024-02-01") });
    const b = mem("m-b", { isLead: true, joinedAt: new Date("2024-01-01") });
    const r = teamLead([a, b], baseCtx());
    expect(r.winner?.membershipId).toBe("m-b");
  });

  it("returns null when no lead", () => {
    const r = teamLead([mem("m-a"), mem("m-b")], baseCtx());
    expect(r.winner).toBeNull();
  });
});

describe("leastLoaded", () => {
  it("sorts by load then weight desc then membershipId", () => {
    const a = mem("m-z", { load: 2, weight: 50 });
    const b = mem("m-a", { load: 1, weight: 50 });
    const c = mem("m-b", { load: 1, weight: 80 });
    const r = leastLoaded([a, b, c], baseCtx());
    expect(r.winner?.membershipId).toBe("m-b");
  });
});

describe("roundRobin", () => {
  it("does not mutate input order", () => {
    const a = mem("m-b");
    const b = mem("m-a");
    const arr = [a, b];
    roundRobin(arr, baseCtx());
    expect(arr[0]?.membershipId).toBe("m-b");
  });

  it("rotates after recent assignment (membership order)", () => {
    const a = mem("m-a", { weight: 1 });
    const b = mem("m-b", { weight: 1 });
    const c = mem("m-c", { weight: 1 });
    const ctx: StrategyContext = {
      ...baseCtx(),
      recentAssignmentsForTeam: [{ assignedMembershipId: "m-a", triggeredAt: 1 }],
    };
    const r = roundRobin([a, b, c], ctx);
    expect(r.winner?.membershipId).toBe("m-b");
  });
});

describe("roundRobinThenLeast", () => {
  it("returns null when RR winner at cap and all others at or over cap", () => {
    const a = mem("m-a", { load: 5 });
    const b = mem("m-b", { load: 5 });
    const ctx: StrategyContext = {
      ...baseCtx(),
      maxConcurrentAssignments: 5,
      recentAssignmentsForTeam: [],
    };
    const r = roundRobinThenLeast([a, b], ctx);
    expect(r.winner).toBeNull();
  });

  it("falls back to least-loaded among under-cap when RR pick is over cap", () => {
    const a = mem("m-a", { load: 3, weight: 1 });
    const b = mem("m-b", { load: 0, weight: 1 });
    const ctx: StrategyContext = {
      ...baseCtx(),
      maxConcurrentAssignments: 2,
      recentAssignmentsForTeam: [{ assignedMembershipId: "m-b", triggeredAt: 1 }],
    };
    const r = roundRobinThenLeast([a, b], ctx);
    expect(r.winner?.membershipId).toBe("m-b");
  });
});
