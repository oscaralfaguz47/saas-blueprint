import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  let membership = await getDefaultTenantForUser(session.user.id);

  if (!membership) {
    await ensureDraftWorkspaceForUser({
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
    });
    redirect("/setup/workspace");
  }

  if (membership.tenant.status === "DRAFT") {
    redirect("/setup/workspace");
  }

  const tenantId = membership.tenant.id;
  const workspace = {
    id: membership.tenant.id,
    name: membership.tenant.name,
    logoObjectKey: membership.tenant.logoObjectKey ?? null,
  };

  return (
    <AppLayoutHydrationGate
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      workspace={workspace}
      tenantId={tenantId}
    >
      {children}
    </AppLayoutHydrationGate>
  );
}
