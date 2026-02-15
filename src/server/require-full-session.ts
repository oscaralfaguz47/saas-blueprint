import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { ApiErrors } from "@/lib/api-response";

/**
 * Enforce that the session is a full session (not PENDING_MFA, and if 2FA is enabled, MFA must be verified).
 * Use on all API routes except POST /api/auth/2fa/verify and POST /api/auth/2fa/cancel.
 * Returns a 401 NextResponse if the session must complete 2FA first; otherwise returns null.
 */
export function requireFullSession(session: Session | null): NextResponse | null {
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const needsMfa =
    session.user.authLevel === "PENDING_MFA" ||
    (session.user.totpEnabled === true && !session.user.mfaVerified);

  if (needsMfa) return ApiErrors.MFA_REQUIRED();
  return null;
}
