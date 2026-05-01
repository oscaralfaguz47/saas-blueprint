import { leastLoaded } from "./least-loaded";
import { roundRobin } from "./round-robin";
import type { Candidate, StrategyContext, StrategyResult } from "./types";

/**
 * Round-robin first; if the RR winner is at/over team workload cap, fall back to least-loaded
 * among remaining members who are strictly under cap. If none under cap, `winner` is null.
 */
export function roundRobinThenLeast(candidates: Candidate[], context: StrategyContext): StrategyResult {
  if (candidates.length === 0) {
    return { winner: null, reason: "NO_CANDIDATES" };
  }
  const rr = roundRobin(candidates, context);
  if (!rr.winner) {
    return rr;
  }
  const cap = context.maxConcurrentAssignments;
  if (cap == null) {
    return rr;
  }
  if (rr.winner.membership.financeOpenAssignmentsCount < cap) {
    return rr;
  }
  const remaining = candidates.filter((c) => c.membershipId !== rr.winner!.membershipId);
  const underCap = remaining.filter((c) => c.membership.financeOpenAssignmentsCount < cap);
  if (underCap.length === 0) {
    return { winner: null, reason: "ROUND_ROBIN_THEN_LEAST_ALL_OVER_CAP" };
  }
  return leastLoaded(underCap, context);
}
