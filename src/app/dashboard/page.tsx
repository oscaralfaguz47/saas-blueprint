import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/tenancy";

export default async function DashboardRootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/signin");

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) {
    // Later: show "Create tenant" flow
    redirect("/unauthorized");
  }

  // For now redirect to member area (or a tenant overview)
  redirect(`/dashboard/member`);
}
