import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { checkAndUpdateSessionActivity } from "@/server/services/inactivity";
import { getLinkChallengeCookieName } from "@/server/lib/cookie-names";
import SignInForm from "./signin-form";
import { getAuthErrorCopy } from "@/lib/auth-errors";
import AuthCard from "@/components/auth/auth-card";

type Props = {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
};

export default async function SignInPage({ searchParams }: Props) {
  // ── 1. Link challenge cookie (unauthenticated Magic Link conflict flow) ───
  const cookieStore = await cookies();
  const linkChallengeToken = cookieStore.get(getLinkChallengeCookieName())?.value;
  if (linkChallengeToken) {
    redirect(`/auth/link-account?challenge=${encodeURIComponent(linkChallengeToken)}`);
  }

  const params = await searchParams;
  const error = params?.error;

  // ── 2. Active session handling ────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (session?.user) {
    // Revoked/expired session check — avoid sign-out loop.
    if (session.user.sessionToken) {
      const activity = await checkAndUpdateSessionActivity(session.user.sessionToken);
      if (activity.status === "expired" || activity.status === "session_not_found") {
        redirect("/api/auth/signout?callbackUrl=/auth/sign-in");
      }
    }

    // AccessDenied with active session = Settings provider-linking mismatch.
    // Check whether there is a recent email_mismatch intent for this user.
    // Scoped by userId so concurrent users do not interfere.
    if (error === "AccessDenied" && session.user.id) {
      const recentMismatch = await prisma.accountLinkIntent.findFirst({
        where: {
          userId: session.user.id,
          errorCode: "email_mismatch",
          consumedAt: { gt: new Date(Date.now() - 60 * 1000) },
        },
        orderBy: { consumedAt: "desc" },
        select: { id: true, targetProvider: true },
      });

      if (recentMismatch) {
        // Clear the errorCode so this redirect only fires once.
        // If the user hits the back button and refreshes, they see Settings
        // without the error (which is fine — they can try again).
        await prisma.accountLinkIntent.update({
          where: { id: recentMismatch.id },
          data: { errorCode: null },
        });
        redirect(
          `/app/account?tab=security&error=link_email_mismatch&provider=${encodeURIComponent(recentMismatch.targetProvider)}`
        );
      }
    }

    // Normal active session redirect.
    const callbackUrl = params?.callbackUrl?.trim();
    if (callbackUrl && callbackUrl.startsWith("/")) redirect(callbackUrl);
    redirect("/app/requests");
  }

  // ── 3. No active session: handle error params ─────────────────────────────
  // AccessDenied with no session = Magic Link conflict flow.
  // /api/link/pending checks for a pending AuthLinkChallenge and either
  // redirects to /auth/link-account or back here with the real error.
  if (error === "AccessDenied") {
    redirect("/api/link/pending");
  }

  const errorCopy = error ? getAuthErrorCopy(error) : null;

  return (
    <AuthCard
      title="Sign in"
      subtitle="No password required. Use Google, Microsoft, Passkey, or your email."
      message={
        errorCopy
          ? {
              tone: "error",
              title: errorCopy.title,
              description: errorCopy.description,
              code: errorCopy.code,
            }
          : undefined
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
