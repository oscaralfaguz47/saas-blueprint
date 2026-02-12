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
  children: React.ReactNode;
};

export default function AppLayoutClient({
  user,
  workspace,
  pendingInvitationsCount = 0,
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
    <div className="flex min-h-screen w-full bg-[var(--bg-main)]">
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />
      <div className="flex min-w-0 flex-1 flex-col border-l border-[var(--border-subtle)] w-full overflow-hidden">
        <AppHeader
          user={user}
          workspace={workspace}
          pendingInvitationsCount={pendingInvitationsCount}
          onMenuClick={isMobile ? () => setSidebarOpen(true) : undefined}
        />
        <main className="min-h-0 flex-1 w-full overflow-auto text-[var(--text-primary)]">
          <div className="w-full px-4 py-6 sm:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
