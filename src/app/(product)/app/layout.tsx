import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenant?.id ?? null;
  const workspace = membership?.tenant
    ? {
        id: membership.tenant.id,
        name: membership.tenant.name,
        logoObjectKey: membership.tenant.logoObjectKey ?? null,
      }
    : null;

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
