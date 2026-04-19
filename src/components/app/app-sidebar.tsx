"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronLeft,
  IconChevronRight,
  IconFileText,
  IconHelpCircle,
  IconPlus,
  IconSettings,
  IconWorkspace,
  IconX,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useCreateWorkspaceModal } from "@/components/app/workspace/create-workspace-modal-context";
import { useCreateRequestModal } from "@/components/app/requests/create-request-modal-context";
import { useTenantPermissions } from "@/components/app/tenant-permissions-context";

function workspaceInitials(name: string): string {
  const s = name.trim();
  if (!s) return "WS";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return s.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type TenantItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDefaultTenant: boolean;
};

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
  /** When true, sidebar is shown as overlay (mobile). */
  isMobile: boolean;
  /** When true, show Platform Admin link (vendor permission admin.tenants.read). */
  canAccessPlatformAdmin?: boolean;
  pendingInvitationsCount?: number;
};

function isRequestsActive(pathname: string) {
  return pathname === "/app/requests" || pathname.startsWith("/app/requests/");
}

const hoverBg = "hover:bg-(--nav-hover)";
const activeBg = "bg-(--nav-active) shadow-sm ring-1 ring-inset ring-(--color-primary-soft)/50";
const brandBoxBg = "bg-(--bg-surface-elev) shadow-sm border border-(--border-subtle)";

export default function AppSidebar({
  open,
  onClose,
  isMobile,
  canAccessPlatformAdmin = false,
  pendingInvitationsCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const apiFetch = useApiFetch();
  const { openCreateWorkspaceModal } = useCreateWorkspaceModal();
  const { openCreateRequestModal } = useCreateRequestModal();
  const { hasAny } = useTenantPermissions();
  const canCreateRequests = hasAny(["tenant.requests.create"]);
  const canAccessWorkspaceSettings = hasAny([
    "tenant.settings.manage",
    "tenant.users.read",
    "tenant.billing.manage",
  ]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Read initial value from localStorage via useSyncExternalStore (no setState in effect; avoids cascading-renders lint).
  const collapsedFromStorage = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem("sidebar-collapsed") === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const collapsed = userToggled ?? collapsedFromStorage;

  useEffect(() => {
    try {
      window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const toggleCollapsed = () => setUserToggled((prev) => !(prev ?? collapsedFromStorage));

  const lastFetchAttemptRef = useRef(0);

  // Load workspaces when sidebar is visible: always on desktop, or when mobile drawer is open
  useEffect(() => {
    const sidebarVisible = !isMobile || open;
    if (!sidebarVisible) return;

    const controller = new AbortController();
    const signal = controller.signal;
    
    // Only show spinner if we have no data yet (first load)
    if (tenants.length === 0) setTenantsLoading(true);
    lastFetchAttemptRef.current = Date.now();

    apiFetch("/api/tenant", { showToastOnError: true, signal })
      .then((r) => (signal.aborted ? null : r.json()))
      .then((json: { data?: { tenants?: TenantItem[] } } | null) => {
        if (json && !signal.aborted) setTenants(json.data?.tenants ?? []);
      })
      .catch(() => {
        if (!signal.aborted) setTenants([]);
      })
      .finally(() => {
        if (!signal.aborted) {
          setTenantsLoading(false);
        }
      });
      
    return () => {
      controller.abort();
    };
  }, [isMobile, open, apiFetch, tenants.length]);

  useEffect(() => {
    const sidebarVisible = !isMobile || open;
    if (!sidebarVisible) return;
    const controller = new AbortController();
    void apiFetch("/api/records?tab=inbox&limit=1", {
      showToastOnError: false,
      signal: controller.signal,
    })
      .then((r) => (controller.signal.aborted ? null : r.json()))
      .then((json: { data?: { records?: unknown[] } } | null) => {
        if (json && !controller.signal.aborted) {
          const hasItems = (json.data?.records?.length ?? 0) > 0;
          setInboxCount(hasItems ? 1 : 0);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isMobile, open, apiFetch]);

  const refetchTenants = useCallback(() => {
    lastFetchAttemptRef.current = Date.now();
    // For background refetches, we don't necessarily show the spinner unless no data exists
    if (tenants.length === 0) setTenantsLoading(true);

    apiFetch("/api/tenant", { showToastOnError: false })
      .then((r) => r.json())
      .then((json: { data?: { tenants?: TenantItem[] } }) => {
        setTenants(json.data?.tenants ?? []);
      })
      .catch(() => {
        setTenants([]);
      })
      .finally(() => {
        setTenantsLoading(false);
      });
  }, [apiFetch, tenants.length]);

  // Refetch tenant list when workspace changes (e.g. after creating a new workspace) so "Current" updates
  useEffect(() => {
    const onReady = () => {
      // Deduplicate against the mount-time fetch
      if (Date.now() - lastFetchAttemptRef.current < 500) return;
      refetchTenants();
    };
    window.addEventListener("workspace-ready", onReady);
    return () => window.removeEventListener("workspace-ready", onReady);
  }, [refetchTenants]);

  // Refetch when workspace name/icon is updated in settings so sidebar list reflects changes
  useEffect(() => {
    window.addEventListener("workspace-updated", refetchTenants);
    return () => window.removeEventListener("workspace-updated", refetchTenants);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !isMobile) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, isMobile, onClose]);

  async function handleSwitchTenant(tenantId: string) {
    setSwitchingId(tenantId);
    try {
      const res = await apiFetch("/api/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        onClose();
        router.push("/app/requests");
        router.refresh();
        const done = () => {
          setSwitchingId(null);
          window.removeEventListener("workspace-ready", onReady);
          clearTimeout(fallback);
        };
        const onReady = () => {
          apiFetch("/api/tenant", { showToastOnError: false })
            .then((r) => r.json())
            .then((json: { data?: { tenants?: TenantItem[] } }) => {
              setTenants(json.data?.tenants ?? []);
            });
          done();
        };
        window.addEventListener("workspace-ready", onReady);
        const fallback = setTimeout(done, 3000);
        return;
      }
    } catch {
      // Toast already shown by apiFetch
    }
    setSwitchingId(null);
  }

  const requestsActive = isRequestsActive(pathname);
  const workspaceSettingsActive =
    pathname === "/app/settings/workspace" || pathname.startsWith("/app/settings/workspace?");
  const helpActive =
    pathname === "/help" ||
    pathname.startsWith("/help/") ||
    pathname === "/app/help" ||
    pathname.startsWith("/app/help/");
  const platformAdminActive = pathname.startsWith("/admin");

  const showLabels = !collapsed;
  const content = (
    <div className="flex h-full flex-col bg-(--bg-app)">
      {/* Top brand row — entire row clickable, routes to /requests */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-(--border-subtle) ${showLabels ? "px-4" : "justify-center px-0"} ${isMobile ? "justify-between" : ""}`}
      >
        <Link
          href="/app/requests"
          onClick={() => isMobile && onClose()}
          className={`flex flex-1 items-center gap-2 font-semibold text-(--text-primary) transition-colors duration-150 ${showLabels ? "" : "justify-center"} rounded-lg ${brandBoxBg} hover:bg-(--bg-surface-hover) min-h-[2.5rem] ${showLabels ? "pr-3 pl-2" : "p-2"}`}
          title={collapsed ? "Requests" : undefined}
        >
          {showLabels ? (
            <span className="relative block h-6 w-[110px] shrink-0">
              {/* Light mode logo */}
              <Image
                src="/relitrue-logo.svg"
                alt="Relitrue"
                width={110}
                height={24}
                className="h-6 w-auto object-contain object-left block [html[data-theme='dark']_&]:hidden"
                priority
              />
              {/* Dark mode logo */}
              <Image
                src="/relitrue-logo-dark.svg"
                alt="Relitrue"
                width={110}
                height={24}
                className="h-6 w-auto object-contain object-left hidden [html[data-theme='dark']_&]:block"
                priority
              />
            </span>
          ) : (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-400">
              R
            </span>
          )}
        </Link>
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-lg p-2 text-(--text-secondary) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] hover:text-(--text-primary)"
            aria-label="Close menu"
          >
            <IconX size={18} />
          </button>
        ) : null}
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-3 py-2">
        {tenants.length > 0 && (
          <>
            <Link
              href="/app/requests"
              onClick={() => isMobile && onClose()}
              aria-current={requestsActive ? "page" : undefined}
              title="Requests"
              className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 ${showLabels ? "gap-3 px-3" : "justify-center px-2"} ${requestsActive ? `${activeBg} text-(--text-primary)` : `text-(--text-secondary) ${hoverBg} hover:text-(--text-primary)`}`}
            >
              <IconFileText size={18} className="shrink-0" />
              {showLabels ? (
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span>Requests</span>
                  {inboxCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-primary) px-1 text-[10px] font-semibold text-white">
                      {inboxCount}
                    </span>
                  )}
                </span>
              ) : null}
            </Link>
            {canCreateRequests ? (
              <button
                type="button"
                onClick={() => {
                  openCreateRequestModal();
                  if (isMobile) onClose();
                }}
                title="New request"
                className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-(--color-primary) transition-colors duration-150 ${showLabels ? "gap-3 px-3" : "justify-center px-2"} hover:bg-(--color-primary-soft)`}
              >
                <IconPlus size={18} className="shrink-0" />
                {showLabels ? <span>New request</span> : null}
              </button>
            ) : null}
          </>
        )}
        {canAccessPlatformAdmin ? (
          <Link
            href="/admin/workspaces"
            onClick={() => isMobile && onClose()}
            aria-current={platformAdminActive ? "page" : undefined}
            title="Platform Admin"
            className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 ${showLabels ? "gap-3 px-3" : "justify-center px-2"} ${platformAdminActive ? `${activeBg} text-(--text-primary)` : `text-(--text-secondary) ${hoverBg} hover:text-(--text-primary)`}`}
          >
            <IconSettings size={18} className="shrink-0" />
            {showLabels ? <span>Platform Admin</span> : null}
          </Link>
        ) : null}
      </nav>

      <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-(--border-subtle) px-3 py-2">
        {showLabels ? (
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-quiet-uppercase">Workspace</span>
            {pendingInvitationsCount > 0 && (
              <Link
                href="/invitations"
                onClick={() => isMobile && onClose()}
                className="inline-flex items-center gap-1 rounded-full bg-(--color-primary)/10 px-2 py-0.5 text-[10px] font-semibold text-(--color-primary) hover:bg-(--color-primary)/20 transition-colors"
              >
                {pendingInvitationsCount} pending {pendingInvitationsCount === 1 ? "invite" : "invites"}
              </Link>
            )}
          </div>
        ) : null}

        {showLabels ? (
          <>
            {tenantsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-(--text-muted)">
                <Spinner size="sm" />
                <span>Loading…</span>
              </div>
            ) : (
              <div className="max-h-40 min-h-0 overflow-y-auto space-y-0.5">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${t.isDefaultTenant ? activeBg : "hover:bg-(--nav-hover)"}`}
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) text-[10px] font-bold text-(--text-primary) uppercase">
                      {workspaceInitials(t.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-(--text-primary)">
                      {t.name}
                    </span>
                    {t.isDefaultTenant ? (
                      <span className="shrink-0 rounded-full border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 text-[9px] font-medium text-(--text-muted) opacity-80 shadow-sm">
                        Current
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSwitchTenant(t.id)}
                        disabled={switchingId !== null}
                        className="shrink-0 text-xs font-medium text-(--text-muted) transition-colors hover:text-(--color-primary) disabled:opacity-60"
                      >
                        {switchingId === t.id ? <Spinner size="sm" /> : "Switch"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        <button
          type="button"
          onClick={() => {
            openCreateWorkspaceModal();
            onClose();
          }}
          title="Create workspace"
          className={`mt-1 flex w-full items-center rounded-lg py-2.5 text-sm text-(--text-secondary) transition-colors duration-150 ${hoverBg} hover:text-(--text-primary) ${showLabels ? "gap-3 px-3" : "justify-center px-2"}`}
        >
          <IconPlus size={18} className="shrink-0" />
          {showLabels ? <span>Create workspace</span> : null}
        </button>

        {tenants.length > 0 ? (
          <div className="mt-1 flex flex-col gap-0.5">
            {canAccessWorkspaceSettings ? (
              <Link
                href="/app/settings/workspace"
                onClick={() => isMobile && onClose()}
                aria-current={workspaceSettingsActive ? "page" : undefined}
                title="Workspace settings"
                className={`flex w-full items-center rounded-lg py-2.5 text-sm transition-colors duration-150 ${showLabels ? "gap-3 px-3" : "justify-center px-2"} ${workspaceSettingsActive ? `${activeBg} font-medium text-(--text-primary)` : `text-(--text-secondary) ${hoverBg} hover:text-(--text-primary)`}`}
              >
                <IconWorkspace size={18} className="shrink-0" />
                {showLabels ? <span>Workspace settings</span> : null}
              </Link>
            ) : null}
            <Link
              href="/app/help/inbox"
              onClick={() => isMobile && onClose()}
              aria-current={helpActive ? "page" : undefined}
              title="Help & Support"
              className={`flex w-full items-center rounded-lg py-2.5 text-sm transition-colors duration-150 ${showLabels ? "gap-3 px-3" : "justify-center px-2"} ${helpActive ? `${activeBg} font-medium text-(--text-primary)` : `text-(--text-secondary) ${hoverBg} hover:text-(--text-primary)`}`}
            >
              <IconHelpCircle size={18} className="shrink-0" />
              {showLabels ? <span>Help &amp; Support</span> : null}
            </Link>
          </div>
        ) : null}
      </div>

      {/* Collapse toggle — desktop only */}
      {!isMobile ? (
        <div className="mt-auto border-t border-(--border-subtle) p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center justify-center rounded-lg py-2.5 text-(--text-muted) transition-colors duration-150 ${hoverBg} hover:text-(--text-primary)`}
            title={collapsed ? "Show option names" : "Hide option names"}
          >
            {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (isMobile) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 md:hidden">
        <div
          className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-text-primary)_40%,transparent)]"
          aria-hidden
        />
        <div
          ref={panelRef}
          className="absolute top-0 left-0 flex h-full w-[84%] max-w-sm flex-col border-r border-(--border-subtle) bg-(--bg-app) shadow-xl"
        >
          <div className="flex-1 overflow-y-auto">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <aside
      className={[
        "hidden shrink-0 border-r border-(--border-subtle) md:block",
        collapsed ? "w-16" : "w-64",
      ].join(" ")}
    >
      {content}
    </aside>
  );
}
