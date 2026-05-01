import type { Candidate, StrategyContext, StrategyResult } from "./types";

export function specificMember(candidates: Candidate[], context: StrategyContext): StrategyResult {
  if (candidates.length === 0) {
    return { winner: null, reason: "NO_CANDIDATES" };
  }
  if (!context.specificMembershipId) {
    return { winner: null, reason: "SPECIFIC_MEMBER_MISSING_ID" };
  }
  const winner = candidates.find((c) => c.membershipId === context.specificMembershipId) ?? null;
  if (!winner) {
    return { winner: null, reason: "SPECIFIC_MEMBER_NOT_ELIGIBLE" };
  }
  return { winner, reason: "SPECIFIC_MEMBER" };
}
