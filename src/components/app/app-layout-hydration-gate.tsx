"use client";

import { CreateWorkspaceModalProvider } from "@/components/app/workspace/create-workspace-modal-context";
import { TenantPermissionsProvider } from "@/components/app/tenant-permissions-context";
import { WorkspaceReadyNotifier } from "@/components/app/workspace-ready-notifier";
import AppLayoutClient from "@/components/app/app-layout-client";
import { ActivityTrackerProvider } from "@/components/app/activity-tracker-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { WelcomeBanner } from "@/components/app/welcome-banner";

type Workspace = {
  id: string;
  name: string;
  logoObjectKey?: string | null;
};

type Theme = "light" | "dark" | "system";

type AppLayoutHydrationGateProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  workspace: Workspace | null;
  tenantId: string | null;
  /** A5: Pending workspace invitations for header badge */
  pendingInvitationsCount?: number;
  /** L1: Initial theme from User.appearance */
  initialTheme?: Theme | null;
  /** Platform Admin: show sidebar entry when true */
  canAccessPlatformAdmin?: boolean;
  showWelcomeBanner?: boolean;
  workspaceName?: string | null;
  children: React.ReactNode;
};

export function AppLayoutHydrationGate({
  user,
  workspace,
  tenantId,
  pendingInvitationsCount = 0,
  initialTheme = null,
  canAccessPlatformAdmin = false,
  showWelcomeBanner = false,
  workspaceName = null,
  children,
}: AppLayoutHydrationGateProps) {
  return (
    <>
      <WorkspaceReadyNotifier tenantId={tenantId} />
      <ThemeProvider initialTheme={initialTheme}>
        <ActivityTrackerProvider />
        {showWelcomeBanner && workspaceName && <WelcomeBanner workspaceName={workspaceName} />}
        <TenantPermissionsProvider>
          <CreateWorkspaceModalProvider>
            <AppLayoutClient
              user={user}
              workspace={workspace}
              pendingInvitationsCount={pendingInvitationsCount}
              canAccessPlatformAdmin={canAccessPlatformAdmin}
            >
              {children}
            </AppLayoutClient>
          </CreateWorkspaceModalProvider>
        </TenantPermissionsProvider>
      </ThemeProvider>
    </>
  );
}
