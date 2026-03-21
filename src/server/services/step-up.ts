import "server-only";

import { prisma } from "@/server/db";

const STEP_UP_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Step-up eligibility for sensitive account actions (disable 2FA, regenerate backup codes,
 * change auto-logout, issue remembered device).
 * - If user has no 2FA: full Session (when present) is enough.
 * - If user has 2FA: recent Session.mfaVerifiedAt or UserSecurity.stepUpVerifiedAt within window.
 * When Session row is missing, falls back to UserSecurity.stepUpVerifiedAt (JWT-only / cleaned sessions).
 */
export async function isStepUpEligible(
  sessionToken: string | null | undefined,
  userId: string
): Promise<boolean> {
  const [session, security] = await Promise.all([
    sessionToken
      ? prisma.session.findUnique({
          where: { sessionToken },
          select: { authLevel: true, mfaVerifiedAt: true, revokedAt: true },
        })
      : prisma.session.findFirst({
          where: { userId, revokedAt: null },
          orderBy: { createdAt: "desc" },
          select: { authLevel: true, mfaVerifiedAt: true, revokedAt: true },
        }),
    prisma.userSecurity.findUnique({
      where: { userId },
      select: {
        totpEnabled: true,
        stepUpVerifiedAt: true,
      },
    }),
  ]);

  // Check session-based step-up first
  if (session && !session.revokedAt && session.authLevel === "FULL") {
    // User without 2FA: full session is sufficient
    if (!security?.totpEnabled) return true;
    // User with 2FA: require recent MFA verification
    if (session.mfaVerifiedAt) {
      const elapsed = Date.now() - session.mfaVerifiedAt.getTime();
      if (elapsed <= STEP_UP_WINDOW_MS) return true;
    }
  }

  // Fallback: check UserSecurity.stepUpVerifiedAt
  // Used when Session row is unavailable (JWT-only sessions)
  if (security?.stepUpVerifiedAt) {
    const elapsed = Date.now() - security.stepUpVerifiedAt.getTime();
    if (elapsed <= STEP_UP_WINDOW_MS) {
      return true;
    }
  }

  return false;
}
