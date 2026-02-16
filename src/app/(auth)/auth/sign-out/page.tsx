import AuthCard from "@/components/auth/auth-card";
import SignOutForm from "./sign-out-form";

const DEFAULT_CALLBACK_URL = "/auth/sign-in";

type Props = {
  searchParams?: Promise<{ callbackUrl?: string; reason?: string }>;
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
  const sessionExpired =
    params?.reason === "session_expired" || isSessionExpiredCallback(callbackUrl);

  return (
    <AuthCard
      title={sessionExpired ? "Session expired" : "Sign out"}
      subtitle={
        sessionExpired ? (
          <>Your session has expired. You’ll be signed out and taken to the sign-in page.</>
        ) : (
          <>Are you sure you want to sign out?</>
        )
      }
      badgeText="Secure"
      message={
        sessionExpired
          ? {
              tone: "warning",
              title: "Session expired",
              description:
                "You were inactive too long or your session is no longer valid. Sign in again to continue.",
            }
          : undefined
      }
    >
      <SignOutForm
        callbackUrl={callbackUrl}
        buttonLabel="Sign out"
        sessionExpired={sessionExpired}
      />
    </AuthCard>
  );
}
