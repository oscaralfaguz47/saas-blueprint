import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import AuthCard from "@/components/auth/auth-card";
import { TwoFaChallengeForm } from "./two-fa-challenge-form";

export default async function TwoFaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");
  if (!session.user.totpEnabled) redirect("/app");
  if (session.user.mfaVerified) redirect("/app");

  return (
    <AuthCard
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app or a backup code."
    >
      <TwoFaChallengeForm />
    </AuthCard>
  );
}
