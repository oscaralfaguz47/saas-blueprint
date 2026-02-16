import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { checkAndUpdateSessionActivity } from "@/server/services/inactivity";
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
  const session = await getServerSession(authOptions);
  if (session?.user) {
    // If the session in the cookie is revoked/expired, clear it first so we show the form (avoids sign-out loop).
    if (session.user.sessionToken) {
      const activity = await checkAndUpdateSessionActivity(session.user.sessionToken);
      if (activity.status === "expired" || activity.status === "session_not_found") {
        redirect("/api/auth/signout?callbackUrl=/auth/sign-in");
      }
    }
    const params = await searchParams;
    const callbackUrl = params?.callbackUrl?.trim();
    if (callbackUrl && callbackUrl.startsWith("/")) redirect(callbackUrl);
    redirect("/app/requests");
  }

  const params = await searchParams;
  const error = params?.error;
  const errorCopy = error ? getAuthErrorCopy(error) : null;

  return (
    <AuthCard
      title="Sign in"
      subtitle="No password required. Use Google or get a magic link."
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
