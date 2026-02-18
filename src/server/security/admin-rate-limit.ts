import "server-only";

/** Per-actor rate limits for platform admin endpoints. Keys: actor userId. */
const store = new Map<string, Map<string, { count: number; resetAt: number }>>();

const WINDOW_MS = 60 * 1000; // 1 minute

function getOrCreateActorEntry(actorUserId: string): Map<string, { count: number; resetAt: number }> {
  let entry = store.get(actorUserId);
  if (!entry) {
    entry = new Map();
    store.set(actorUserId, entry);
  }
  return entry;
}

function check(
  actorUserId: string,
  key: string,
  maxPerMinute: number
): boolean {
  const now = Date.now();
  const actorEntry = getOrCreateActorEntry(actorUserId);
  const slot = actorEntry.get(key);

  if (!slot) {
    actorEntry.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (now >= slot.resetAt) {
    actorEntry.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (slot.count >= maxPerMinute) return false;
  slot.count += 1;
  return true;
}

/** 60/min — e.g. user search (combobox). */
export function checkAdminUserSearchLimit(actorUserId: string): boolean {
  return check(actorUserId, "admin.users.search", 60);
}

/** 30/min — workspaces list. */
export function checkAdminWorkspacesListLimit(actorUserId: string): boolean {
  return check(actorUserId, "admin.workspaces.list", 30);
}

/** 60/min — workspace summary (single tenant). */
export function checkAdminWorkspaceDetailLimit(actorUserId: string): boolean {
  return check(actorUserId, "admin.workspace.detail", 60);
}

/** 30/min — members or invites list per tenant. */
export function checkAdminMembersOrInvitesListLimit(actorUserId: string): boolean {
  return check(actorUserId, "admin.members.invites.list", 30);
}

/** 10/min — governance mutations (invite, revoke, role, status, transfer). */
export function checkAdminMutationLimit(actorUserId: string): boolean {
  return check(actorUserId, "admin.mutation", 10);
}

/** 3/min — break-glass reset Primary Owner 2FA. */
export function checkAdminBreakGlassLimit(actorUserId: string): boolean {
  return check(actorUserId, "admin.break_glass.mfa_reset", 3);
}
