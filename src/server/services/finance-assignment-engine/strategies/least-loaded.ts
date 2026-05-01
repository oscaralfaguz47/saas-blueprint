import type { Candidate, StrategyContext, StrategyResult } from "./types";

export function leastLoaded(candidates: Candidate[], _context: StrategyContext): StrategyResult {
  if (candidates.length === 0) {
    return { winner: null, reason: "NO_CANDIDATES" };
  }
  const sorted = [...candidates].sort((a, b) => {
    const loadA = a.membership.financeOpenAssignmentsCount;
    const loadB = b.membership.financeOpenAssignmentsCount;
    if (loadA !== loadB) return loadA - loadB;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.membershipId.localeCompare(b.membershipId);
  });
  return { winner: sorted[0]!, reason: "LEAST_LOADED" };
}
