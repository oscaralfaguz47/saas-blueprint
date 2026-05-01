import type { Candidate, StrategyContext, StrategyResult } from "./types";

/** Normalize weights so expanded ring stays bounded; preserves ratios when possible. */
function normalizedWeights(candidates: Candidate[]): number[] {
  const raw = candidates.map((c) => Math.max(1, c.weight));
  const sum = raw.reduce((a, b) => a + b, 0);
  const maxRing = 2000;
  if (sum <= maxRing) return raw;
  const factor = maxRing / sum;
  return raw.map((w) => Math.max(1, Math.round(w * factor)));
}

function buildWeightedOrder(sorted: Candidate[], weights: number[]): number[] {
  const order: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let k = 0; k < weights[i]; k++) {
      order.push(i);
    }
  }
  return order;
}

/**
 * Weighted round-robin: deterministic order by `membershipId`, rotation keyed on last assignment.
 * Does not mutate `candidates`.
 */
export function roundRobin(candidates: Candidate[], context: StrategyContext): StrategyResult {
  if (candidates.length === 0) {
    return { winner: null, reason: "NO_CANDIDATES" };
  }
  const sorted = [...candidates].sort((a, b) => a.membershipId.localeCompare(b.membershipId));
  const weights = normalizedWeights(sorted);
  const order = buildWeightedOrder(sorted, weights);
  if (order.length === 0) {
    return { winner: null, reason: "NO_CANDIDATES" };
  }

  const recentId = context.recentAssignmentsForTeam[0]?.assignedMembershipId ?? null;
  let pos = 0;
  if (recentId) {
    const idx = sorted.findIndex((c) => c.membershipId === recentId);
    if (idx >= 0) {
      let lastPos = -1;
      for (let p = 0; p < order.length; p++) {
        if (order[p] === idx) lastPos = p;
      }
      if (lastPos >= 0) {
        pos = (lastPos + 1) % order.length;
      }
    }
  }

  const winnerIdx = order[pos]!;
  return { winner: sorted[winnerIdx]!, reason: "ROUND_ROBIN_NEXT" };
}
