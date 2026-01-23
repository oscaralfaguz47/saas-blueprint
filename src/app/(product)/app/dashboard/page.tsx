import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { redirect } from "next/navigation";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { requireTenantPermission } from "@/server/security/workspace-guards";


export default async function AppDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

const membership = await getDefaultTenantForUser(session.user.id);

if (!membership?.tenant) {
  redirect("/app");
}

  await requireTenantPermission({
  userId: session.user.id,
  tenantId: membership.tenant.id,
  permission: "tenant.users.read", // permiso básico para validar membership
});

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Workspace Dashboard</h1>
      <p className="mt-2">Tenant: {membership.tenant.name}</p>
      <p className="mt-2 text-sm text-gray-600">User: {session.user.email}</p>
    </main>
  );
}
