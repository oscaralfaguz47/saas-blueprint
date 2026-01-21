import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/tenancy";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  // If user already has a tenant, onboarding should not loop.
  const membership = await getDefaultTenantForUser(session.user.id);
  if (membership?.tenant) {
    redirect("/app/dashboard");
  }

  // If somehow no tenant, go to /app (which will bootstrap).
  redirect("/app");
}
