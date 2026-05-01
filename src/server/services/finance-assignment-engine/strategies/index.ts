import { AssignmentStrategy } from "@prisma/client";
import { leastLoaded } from "./least-loaded";
import { roundRobin } from "./round-robin";
import { roundRobinThenLeast } from "./round-robin-then-least";
import { specificMember } from "./specific-member";
import { teamLead } from "./team-lead";
import type { Candidate, StrategyContext, StrategyResult } from "./types";

export type { Candidate, RecentAssignment, StrategyContext, StrategyResult } from "./types";

export const STRATEGY_MAP: Record<
  AssignmentStrategy,
  (candidates: Candidate[], context: StrategyContext) => StrategyResult
> = {
  [AssignmentStrategy.ROUND_ROBIN]: roundRobin,
  [AssignmentStrategy.LEAST_LOADED]: leastLoaded,
  [AssignmentStrategy.ROUND_ROBIN_THEN_LEAST]: roundRobinThenLeast,
  [AssignmentStrategy.SPECIFIC_MEMBER]: specificMember,
  [AssignmentStrategy.TEAM_LEAD]: teamLead,
};
