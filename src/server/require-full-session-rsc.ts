import "server-only";

import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { requireFullSession } from "@/server/require-full-session";

/**
 * Server Components / layouts: same enforcement as {@link requireFullSession} for Route Handlers
 * (full session, MFA verified when required, session activity not expired), but uses redirects instead
 * of JSON error responses.
 */
export async function requireFullSessionRsc(session: Session | null): Promise<Session> {
  const err = await requireFullSession(session);
  if (!err) {
    return session!;
  }

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const needsMfa =
    session.user.authLevel === "PENDING_MFA" ||
    (session.user.totpEnabled === true && !session.user.mfaVerified);

  if (needsMfa) {
    if (session.user.mfaEnforced && !session.user.totpEnabled) {
      redirect("/auth/setup-2fa");
    }
    redirect("/auth/2fa");
  }

  redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
}
