"use client";

import { useSyncExternalStore } from "react";
import { CreateWorkspaceModalProvider } from "@/components/app/workspace/create-workspace-modal-context";
import { TenantPermissionsProvider } from "@/components/app/tenant-permissions-context";
import { WorkspaceReadyNotifier } from "@/components/app/workspace-ready-notifier";
import AppLayoutClient from "@/components/app/app-layout-client";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ThemeBootstrap from "@/components/theme/theme-bootstrap";

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
  children: React.ReactNode;
};

function emptySubscribe() {
  return () => {};
}

/**
 * Renders a consistent placeholder until after client mount to avoid hydration
 * mismatch with Next.js metadata/viewport boundaries (hidden/display:contents).
 * useSyncExternalStore: server/getServerSnapshot returns false, client/getClientSnapshot returns true.
 */
export function AppLayoutHydrationGate({
  user,
  workspace,
  tenantId,
  pendingInvitationsCount = 0,
  initialTheme = null,
  children,
}: AppLayoutHydrationGateProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div
        className="min-h-screen w-full bg-(--bg-main)"
        aria-hidden
        suppressHydrationWarning
      />
    );
  }

  return (
    <>
      <ThemeBootstrap />
      <WorkspaceReadyNotifier tenantId={tenantId} />
      <ThemeProvider initialTheme={initialTheme}>
        <TenantPermissionsProvider>
          <CreateWorkspaceModalProvider>
            <AppLayoutClient user={user} workspace={workspace} pendingInvitationsCount={pendingInvitationsCount}>
              {children}
            </AppLayoutClient>
          </CreateWorkspaceModalProvider>
        </TenantPermissionsProvider>
      </ThemeProvider>
    </>
  );
}
