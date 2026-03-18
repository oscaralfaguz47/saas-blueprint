import "server-only";

import { prisma } from "@/server/db";

/** Throttle lastActivityAt updates to at most once per 2 minutes. */
const UPDATE_THRESHOLD_MS = 2 * 60 * 1000;

/** Rolling DB session.expires for FULL sessions (aligned with JWT max age). */
const SESSION_ROLLING_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

export type InactivityResult =
  | { status: "ok" }
  | { status: "expired" }
  | { status: "session_not_found" };

/**
 * Check session: revocation, forceLogoutAt, idle timeout. Optionally update lastActivityAt (throttled).
 * - If session is revoked → expired.
 * - If forceLogoutAt set and (mfaVerifiedAt ?? createdAt) < forceLogoutAt → revoke, expired.
 * - If autoLogoutEnabled and idle exceeds minutes (fallback 21600 if minutes missing/invalid) → idle_timeout.
 * - Else if lastActivityAt older than 2 min → update lastActivityAt; FULL sessions also roll expires (+15d).
 */
export async function checkAndUpdateSessionActivity(
  sessionToken: string
): Promise<InactivityResult> {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: {
      id: true,
      lastActivityAt: true,
      userId: true,
      revokedAt: true,
      mfaVerifiedAt: true,
      createdAt: true,
      authLevel: true,
    },
  });

  if (!session) return { status: "session_not_found" };
  if (session.revokedAt) return { status: "expired" };

  const userSecurity = await prisma.userSecurity.findUnique({
    where: { userId: session.userId },
    select: {
      autoLogoutEnabled: true,
      autoLogoutMinutes: true,
      forceLogoutAt: true,
    },
  });

  const now = new Date();
  const mfaOrCreated = session.mfaVerifiedAt ?? session.createdAt;

  if (userSecurity?.forceLogoutAt && mfaOrCreated < userSecurity.forceLogoutAt) {
    await prisma.session.update({
      where: { sessionToken },
      data: { revokedAt: now, logoutReason: "force_logout" },
    });
    return { status: "expired" };
  }

  const lastAt = session.lastActivityAt.getTime();
  const elapsed = now.getTime() - lastAt;

  const rawMinutes = userSecurity?.autoLogoutMinutes ?? 0;
  const safeMinutes = rawMinutes > 0 ? rawMinutes : 21600; // fallback to 15 days
  const thresholdMs = userSecurity?.autoLogoutEnabled ? safeMinutes * 60 * 1000 : 0;

  if (thresholdMs > 0 && elapsed >= thresholdMs) {
    await prisma.session.update({
      where: { sessionToken },
      data: { revokedAt: now, logoutReason: "idle_timeout" },
    });
    return { status: "expired" };
  }

  if (elapsed >= UPDATE_THRESHOLD_MS) {
    const newExpires = new Date(now.getTime() + SESSION_ROLLING_MAX_AGE_MS);
    await prisma.session.update({
      where: { sessionToken },
      data:
        session.authLevel === "FULL"
          ? { lastActivityAt: now, expires: newExpires }
          : { lastActivityAt: now },
    });
  }

  return { status: "ok" };
}
