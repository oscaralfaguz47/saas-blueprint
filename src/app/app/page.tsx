import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/tenancy";
import { ensureDefaultTenantForUser } from "@/server/tenancy-bootstrap";

export default async function AppRootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership =
    (await getDefaultTenantForUser(session.user.id)) ??
    (await ensureDefaultTenantForUser({
      userId: session.user.id,
      userEmail: session.user.email,
    }));

  if (!membership?.tenant) {
    // If bootstrap fails (should be rare), send to onboarding
    redirect("/app/onboarding");
  }

  // Main entrypoint
  redirect("/app/dashboard");
}
