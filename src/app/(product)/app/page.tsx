import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";

import { hasVendorPermission } from "@/server/security/vendor-authorization";

export default async function AppRootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);

  if (!membership?.tenant) {
    const canAccessPlatformAdmin = await hasVendorPermission({
      userId: session.user.id,
      legacyRole: session.user.role,
      permission: "admin.tenants.read",
    });
    if (canAccessPlatformAdmin) redirect("/admin/workspaces");
    redirect("/app/onboarding");
  }

  redirect("/app/requests");
}
