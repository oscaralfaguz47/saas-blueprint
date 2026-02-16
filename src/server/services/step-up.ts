import "server-only";

import { prisma } from "@/server/db";

const STEP_UP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Step-up eligibility for sensitive account actions (disable 2FA, regenerate backup codes,
 * change auto-logout, issue remembered device).
 * - If user does NOT have 2FA: FULL session is enough (no MFA to re-verify).
 * - If user has 2FA: session must be FULL with mfaVerifiedAt within the last 10 minutes.
 * When sessionToken is missing (e.g. JWT not yet updated after sign-in), resolves by userId.
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
      select: { totpEnabled: true },
    }),
  ]);

  if (!session || session.revokedAt) return false;
  if (session.authLevel !== "FULL") return false;

  // User without 2FA: full session is sufficient (no step-up challenge possible).
  if (!security?.totpEnabled) return true;

  // User with 2FA: require recent MFA verification (within 10 minutes).
  if (!session.mfaVerifiedAt) return false;
  const elapsed = Date.now() - session.mfaVerifiedAt.getTime();
  return elapsed <= STEP_UP_WINDOW_MS;
}
