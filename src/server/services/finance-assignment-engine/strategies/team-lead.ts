import type { Candidate, StrategyContext, StrategyResult } from "./types";

export function teamLead(candidates: Candidate[], _context: StrategyContext): StrategyResult {
  if (candidates.length === 0) {
    return { winner: null, reason: "NO_CANDIDATES" };
  }
  const leads = candidates.filter((c) => c.isLead);
  if (leads.length === 0) {
    return { winner: null, reason: "NO_TEAM_LEAD" };
  }
  const sorted = [...leads].sort((a, b) => {
    const ja = a.joinedAt.getTime();
    const jb = b.joinedAt.getTime();
    if (ja !== jb) return ja - jb;
    return a.membershipId.localeCompare(b.membershipId);
  });
  return { winner: sorted[0]!, reason: "TEAM_LEAD" };
}
