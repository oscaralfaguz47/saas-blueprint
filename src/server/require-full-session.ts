import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { ApiErrors } from "@/lib/api-response";
import { logSessionInvalid } from "@/server/security-log";
import { checkAndUpdateSessionActivity } from "@/server/services/inactivity";
import { isMfaEnforcedForUser } from "@/server/security/member-security-governance";

/**
 * Enforce that the session is a full session (not PENDING_MFA, and if 2FA is enabled, MFA must be verified).
 * Also enforces inactivity/expiry: if the Session row is revoked or past idle timeout, returns 401.
 * Use on all API routes except POST /api/auth/2fa/verify and POST /api/auth/2fa/cancel.
 * Returns a 401 NextResponse if the session must complete 2FA, is expired, or is invalid; otherwise returns null.
 */
export async function requireFullSession(session: Session | null): Promise<NextResponse | null> {
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const needsMfa =
    session.user.authLevel === "PENDING_MFA" ||
    (session.user.totpEnabled === true && !session.user.mfaVerified);

  if (needsMfa) {
    logSessionInvalid({
      reason: session.user.authLevel === "PENDING_MFA" ? "pending_mfa" : "mfa_not_verified",
      userId: session.user.id,
    });
    return ApiErrors.MFA_REQUIRED();
  }
  return checkActivityAndReturn(session);
}

/**
 * E6: Use on account/2FA setup and me routes so users with admin-forced 2FA (mfaEnforced && !totpEnabled)
 * can complete setup from PENDING_MFA. If session is PENDING_MFA and user has mfaEnforced, allows through.
 */
export async function requireFullSessionOrForcedMfaSetup(
  session: Session | null
): Promise<NextResponse | null> {
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();
  if (session.user.authLevel === "PENDING_MFA") {
    const mfaEnforced = await isMfaEnforcedForUser(session.user.id);
    if (mfaEnforced) return checkActivityAndReturn(session);
  }
  return requireFullSession(session);
}

async function checkActivityAndReturn(session: Session): Promise<NextResponse | null> {

  // L1: Inactivity/expiry — reject expired or revoked sessions on every API request (not only on layout).
  if (session.user.sessionToken) {
    const activity = await checkAndUpdateSessionActivity(session.user.sessionToken);
    if (activity.status === "expired" || activity.status === "session_not_found") {
      logSessionInvalid({
        reason: activity.status === "expired" ? "expired" : "not_found",
        userId: session.user.id,
      });
      return ApiErrors.UNAUTHENTICATED();
    }
  }
  return null;
}
