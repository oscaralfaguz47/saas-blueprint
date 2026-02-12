import AuthCard from "@/components/auth/auth-card";
import SignOutForm from "./sign-out-form";

const DEFAULT_CALLBACK_URL = "/auth/sign-in";

type Props = {
  searchParams?: Promise<{ callbackUrl?: string }>;
};

function isSessionExpiredCallback(callbackUrl: string): boolean {
  try {
    const url = new URL(callbackUrl, "http://localhost");
    const error = url.searchParams.get("error");
    return error === "SessionExpired" || error === "Session Expired";
  } catch {
    return false;
  }
}

export default async function SignOutPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawCallback = params?.callbackUrl?.trim();
  const callbackUrl = rawCallback && rawCallback.startsWith("/") ? rawCallback : DEFAULT_CALLBACK_URL;
  const sessionExpired = isSessionExpiredCallback(callbackUrl);

  return (
    <AuthCard
      title={sessionExpired ? "Sign out to continue" : "Sign out"}
      subtitle={
        sessionExpired ? (
          <>
            Your session is no longer valid. You must sign out to continue, then sign in again.
          </>
        ) : (
          <>Are you sure you want to sign out?</>
        )
      }
      badgeText="Secure"
      message={
        sessionExpired
          ? {
              tone: "warning",
              title: "Session no longer valid",
              description:
                "Your account may have been reset or your session expired. Sign out below, then sign in again to continue.",
            }
          : undefined
      }
    >
      <SignOutForm
        callbackUrl={callbackUrl}
        buttonLabel="Sign out"
      />
    </AuthCard>
  );
}
