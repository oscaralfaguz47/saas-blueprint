import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { CreateWorkspaceModalProvider } from "@/components/app/workspace/create-workspace-modal-context";
import { WorkspaceReadyNotifier } from "@/components/app/workspace-ready-notifier";
import AppLayoutClient from "@/components/app/app-layout-client";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ThemeBootstrap from "@/components/theme/theme-bootstrap";

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
    <>
      <ThemeBootstrap />
      <WorkspaceReadyNotifier tenantId={tenantId} />

      <ThemeProvider>
        <CreateWorkspaceModalProvider>
          <AppLayoutClient
            user={{
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null,
            }}
            workspace={workspace}
          >
            {children}
          </AppLayoutClient>
        </CreateWorkspaceModalProvider>
      </ThemeProvider>
    </>
  );
}
