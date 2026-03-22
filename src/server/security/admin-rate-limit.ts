import "server-only";

import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";

export type { RateLimitResult };

/** 60/min — e.g. user search (combobox). */
export async function checkAdminUserSearchLimit(actorUserId: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin:users:search:${actorUserId}`, 60, 60_000);
}

/** 30/min — workspaces list. */
export async function checkAdminWorkspacesListLimit(actorUserId: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin:workspaces:list:${actorUserId}`, 30, 60_000);
}

/** 60/min — workspace summary (single tenant). */
export async function checkAdminWorkspaceDetailLimit(actorUserId: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin:workspace:detail:${actorUserId}`, 60, 60_000);
}

/** 30/min — members or invites list per tenant. */
export async function checkAdminMembersOrInvitesListLimit(
  actorUserId: string
): Promise<RateLimitResult> {
  return checkRateLimit(`admin:members:invites:list:${actorUserId}`, 30, 60_000);
}

/** 10/min — governance mutations (invite, revoke, role, status, transfer). */
export async function checkAdminMutationLimit(actorUserId: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin:mutation:${actorUserId}`, 10, 60_000);
}

/** 3/min — break-glass reset Primary Owner 2FA. */
export async function checkAdminBreakGlassLimit(actorUserId: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin:break_glass:mfa_reset:${actorUserId}`, 3, 60_000);
}
