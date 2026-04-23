"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/app/app-header";
import AppSidebar from "@/components/app/app-sidebar";
import { ChatWidgetRoot } from "@/components/help/chat-widget-root";

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
  /** A5: Pending workspace invitations for sidebar */
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
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const lastRefreshRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());

  // Track user activity so focus refresh only fires after genuine inactivity
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("click", updateActivity);
    window.addEventListener("keydown", updateActivity);
    return () => {
      window.removeEventListener("click", updateActivity);
      window.removeEventListener("keydown", updateActivity);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      // Only refresh if: last refresh was >5min ago AND last activity was >2min ago
      // This prevents refresh when focus returns from modal/dialog/other app briefly
      const staleData = now - lastRefreshRef.current > 5 * 60_000;
      const genuinelyInactive = now - lastActivityRef.current > 2 * 60_000;
      if (staleData && genuinelyInactive) {
        lastRefreshRef.current = now;
        router.refresh();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [router]);

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
        pendingInvitationsCount={pendingInvitationsCount}
      />
      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          user={user}
          workspace={workspace}
          onMenuClick={isMobile ? () => setSidebarOpen(true) : undefined}
        />
        <main className="min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto text-(--text-primary)">
          <div className="w-full px-3 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </div>
      <ChatWidgetRoot hasTenant={!!workspace} />
    </div>
  );
}
