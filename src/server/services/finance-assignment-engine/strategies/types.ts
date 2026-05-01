import type { FinanceTeamMember, TenantMembership, User } from "@prisma/client";

/** Team member row with membership + user fields needed for strategies and snapshots. */
export type Candidate = FinanceTeamMember & {
  membership: Pick<
    TenantMembership,
    | "id"
    | "userId"
    | "financeOpenAssignmentsCount"
    | "availability"
    | "status"
    | "financeResponsibility"
  > & {
    user: Pick<User, "name" | "email"> | null;
  };
};

export type RecentAssignment = {
  assignedMembershipId: string;
  triggeredAt: number;
};

export type StrategyContext = {
  ruleId: string;
  teamId: string;
  tenantId: string;
  specificMembershipId: string | null;
  maxConcurrentAssignments: number | null;
  recentAssignmentsForTeam: RecentAssignment[];
};

export type StrategyResult = {
  winner: Candidate | null;
  /** Machine-oriented reason for logs / snapshots (not localized). */
  reason: string;
};
