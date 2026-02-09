import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ensureDefaultTenantForUser } from "@/server/services/tenancy-bootstrap";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await ensureDefaultTenantForUser({
    userId: session.user.id,
    userEmail: session.user.email,
  });

  redirect("/app/requests");
}
