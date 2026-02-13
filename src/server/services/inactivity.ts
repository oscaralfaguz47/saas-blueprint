import "server-only";

import { prisma } from "@/server/db";

const INACTIVITY_THRESHOLD_MS = 5 * 60 * 60 * 1000; // 5 hours
const UPDATE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export type InactivityResult =
  | { status: "ok" }
  | { status: "expired" }
  | { status: "session_not_found" };

/**
 * Check session inactivity and optionally update lastActivityAt.
 * If user has autoLogoutEnabled and lastActivityAt is older than 5 hours, delete session and return expired.
 * If lastActivityAt is older than 5 minutes, update it to now.
 * Call this from app layout (or middleware) when sessionToken is available.
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
    },
  });

  if (!session) return { status: "session_not_found" };

  const userSecurity = await prisma.userSecurity.findUnique({
    where: { userId: session.userId },
    select: { autoLogoutEnabled: true },
  });

  const now = new Date();
  const lastAt = session.lastActivityAt.getTime();
  const elapsed = now.getTime() - lastAt;

  if (userSecurity?.autoLogoutEnabled && elapsed >= INACTIVITY_THRESHOLD_MS) {
    await prisma.session.delete({ where: { sessionToken } });
    return { status: "expired" };
  }

  if (elapsed >= UPDATE_THRESHOLD_MS) {
    await prisma.session.update({
      where: { sessionToken },
      data: { lastActivityAt: now },
    });
  }

  return { status: "ok" };
}
