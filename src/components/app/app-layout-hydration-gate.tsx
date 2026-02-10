"use client";

import { useSyncExternalStore } from "react";
import { CreateWorkspaceModalProvider } from "@/components/app/workspace/create-workspace-modal-context";
import { WorkspaceReadyNotifier } from "@/components/app/workspace-ready-notifier";
import AppLayoutClient from "@/components/app/app-layout-client";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ThemeBootstrap from "@/components/theme/theme-bootstrap";
import { ToastProvider } from "@/components/ui/toast";

type Workspace = {
  id: string;
  name: string;
  logoObjectKey?: string | null;
};

type AppLayoutHydrationGateProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  workspace: Workspace | null;
  tenantId: string | null;
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
      <ThemeProvider>
        <ToastProvider>
          <CreateWorkspaceModalProvider>
            <AppLayoutClient user={user} workspace={workspace}>
              {children}
            </AppLayoutClient>
          </CreateWorkspaceModalProvider>
        </ToastProvider>
      </ThemeProvider>
    </>
  );
}
