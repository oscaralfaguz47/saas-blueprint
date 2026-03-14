"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/app/app-header";
import AppSidebar from "@/components/app/app-sidebar";

type Workspace = {
  id: string;
  name: string;
  logoObjectKey?: string | null;
};

type AppLayoutClientProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  workspace: Workspace | null;
  /** A5: Pending workspace invitations for header badge */
  pendingInvitationsCount?: number;
  /** Platform Admin: show sidebar entry when true */
  canAccessPlatformAdmin?: boolean;
  children: React.ReactNode;
};

export default function AppLayoutClient({
  user,
  workspace,
  pendingInvitationsCount = 0,
  canAccessPlatformAdmin = false,
  children,
}: AppLayoutClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    queueMicrotask(() => setIsMobile(m.matches));
    const listener = () => setIsMobile(m.matches);
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  }, []);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-(--bg-main)">
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
        canAccessPlatformAdmin={canAccessPlatformAdmin}
      />
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          user={user}
          workspace={workspace}
          pendingInvitationsCount={pendingInvitationsCount}
          onMenuClick={isMobile ? () => setSidebarOpen(true) : undefined}
        />
        <main className="min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto text-(--text-primary)">
          <div className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
