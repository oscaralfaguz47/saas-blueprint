import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import AuthCard from "@/components/auth/auth-card";
import { Setup2faForm } from "./setup-2fa-form";

export const dynamic = "force-dynamic";

/**
 * E6: Dedicated 2FA setup page for users who are required to set up 2FA by their workspace
 * (mfaEnforced && !totpEnabled). This page lives outside the app layout so it does not trigger
 * redirect loops. Only users in PENDING_MFA with mfaEnforced see the setup flow; others are
 * redirected appropriately.
 */
export default async function Setup2faPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(
      `/auth/sign-in?callbackUrl=${encodeURIComponent("/auth/setup-2fa")}`
    );
  }

  if (session.user.authLevel !== "PENDING_MFA") {
    if (session.user.totpEnabled && !session.user.mfaVerified) {
      redirect("/auth/2fa");
    }
    redirect("/app");
  }

  if (!session.user.mfaEnforced || session.user.totpEnabled) {
    redirect("/auth/2fa");
  }

  return (
    <AuthCard
      title="Set up two-factor authentication"
      subtitle="Your workspace requires 2FA. Complete the setup below to continue."
      badgeText="Required"
    >
      <Setup2faForm />
    </AuthCard>
  );
}
