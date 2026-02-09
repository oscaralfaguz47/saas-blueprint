"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBilling,
  IconChevronLeft,
  IconChevronRight,
  IconFileText,
  IconPlus,
  IconWorkspace,
  IconX,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { useCreateWorkspaceModal } from "@/components/app/workspace/create-workspace-modal-context";

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
};

function isRequestsActive(pathname: string) {
  return pathname === "/app/requests" || pathname.startsWith("/app/requests/");
}

function isSettingsBillingActive(pathname: string) {
  return pathname === "/app/settings/billing";
}

export default function AppSidebar({ open, onClose, isMobile }: AppSidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { openCreateWorkspaceModal, openWorkspaceSettingsModal } = useCreateWorkspaceModal();
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const toggleCollapsed = () => setCollapsed((c) => !c);

  // Load workspaces when sidebar is visible: always on desktop, or when mobile drawer is open
  useEffect(() => {
    const sidebarVisible = !isMobile || open;
    if (!sidebarVisible) return;
    queueMicrotask(() => setTenantsLoading(true));
    fetch("/api/tenant")
      .then((r) => r.json())
      .then((json: { data?: { tenants?: TenantItem[] } }) => {
        setTenants(json.data?.tenants ?? []);
      })
      .finally(() => setTenantsLoading(false));
  }, [isMobile, open]);

  const refetchTenants = () => {
    fetch("/api/tenant")
      .then((r) => r.json())
      .then((json: { data?: { tenants?: TenantItem[] } }) => {
        setTenants(json.data?.tenants ?? []);
      });
  };

  // Refetch tenant list when workspace changes (e.g. after creating a new workspace) so "Current" updates
  useEffect(() => {
    window.addEventListener("workspace-ready", refetchTenants);
    return () => window.removeEventListener("workspace-ready", refetchTenants);
  }, []);

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
      const res = await fetch("/api/tenant", {
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
          // Refetch tenants so "Current" label updates to the new default
          fetch("/api/tenant")
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
      // fall through
    }
    setSwitchingId(null);
  }

  const requestsActive = isRequestsActive(pathname);
  const billingActive = isSettingsBillingActive(pathname);

  const showLabels = !collapsed;
  const content = (
    <div className="flex h-full flex-col bg-(--bg-surface)">
      {/* Logo — same height as header for alignment; mobile: close (X) at top right */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-(--border-subtle) ${showLabels ? "px-4" : "justify-center px-0"} ${isMobile ? "justify-between" : ""}`}
      >
        <Link
          href="/app/requests"
          onClick={() => isMobile && onClose()}
          className="flex items-center gap-2 font-semibold text-(--text-primary)"
          title={collapsed ? "Requests" : undefined}
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) text-sm">
            ATL
          </span>
        </Link>
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
            aria-label="Close menu"
          >
            <IconX size={18} />
          </button>
        ) : null}
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-3">
        <Link
          href="/app/requests"
          onClick={() => isMobile && onClose()}
          aria-current={requestsActive ? "page" : undefined}
          title="Requests"
          className={[
            "flex items-center rounded-lg py-2.5 text-sm font-medium transition",
            showLabels ? "gap-3 px-3" : "justify-center px-2",
            requestsActive
              ? "bg-(--bg-surface-elev) text-(--text-primary)"
              : "text-(--text-secondary) hover:bg-(--bg-surface-elev) hover:text-(--text-primary)",
          ].join(" ")}
        >
          <IconFileText size={18} className="shrink-0" />
          {showLabels ? <span>Requests</span> : null}
        </Link>
      </nav>

      {/* Workspace section */}
      <div className="mt-2 flex flex-1 flex-col border-t border-(--border-subtle) px-2 py-3">
        {showLabels ? (
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
            Workspace
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
              <div className="max-h-40 overflow-y-auto">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-(--text-primary)">
                      {t.name}
                    </span>
                    {t.isDefaultTenant ? (
                      <span className="shrink-0 rounded bg-(--bg-surface-elev) px-2 py-0.5 text-[10px] font-medium text-(--text-muted)">
                        Current
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSwitchTenant(t.id)}
                        disabled={switchingId !== null}
                        className="shrink-0 text-xs font-medium text-(--color-primary) hover:underline disabled:opacity-60"
                      >
                        {switchingId === t.id ? (
                          <Spinner size="sm" />
                        ) : (
                          "Switch to"
                        )}
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
          className={[
            "flex w-full items-center rounded-lg py-2.5 text-sm text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)",
            showLabels ? "mt-1 gap-3 px-3" : "mt-1 justify-center px-2",
          ].join(" ")}
        >
          <IconPlus size={18} className="shrink-0" />
          {showLabels ? <span>Create workspace</span> : null}
        </button>

        <button
          type="button"
          onClick={() => {
            openWorkspaceSettingsModal();
            onClose();
          }}
          title="Workspace settings"
          className={[
            "flex w-full items-center rounded-lg py-2.5 text-left text-sm text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)",
            showLabels ? "gap-3 px-3" : "justify-center px-2",
          ].join(" ")}
        >
          <IconWorkspace size={18} className="shrink-0" />
          {showLabels ? <span>Workspace settings</span> : null}
        </button>

        <Link
          href="/app/settings/billing"
          onClick={() => isMobile && onClose()}
          aria-current={billingActive ? "page" : undefined}
          title="Billing"
          className={[
            "flex items-center rounded-lg py-2.5 text-sm transition",
            showLabels ? "gap-3 px-3" : "justify-center px-2",
            billingActive
              ? "bg-(--bg-surface-elev) font-medium text-(--text-primary)"
              : "text-(--text-secondary) hover:bg-(--bg-surface-elev) hover:text-(--text-primary)",
          ].join(" ")}
        >
          <IconBilling size={18} className="shrink-0" />
          {showLabels ? <span>Billing</span> : null}
        </Link>
      </div>

      {/* Collapse toggle — desktop only */}
      {!isMobile ? (
        <div className="mt-auto border-t border-(--border-subtle) p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex w-full items-center justify-center rounded-lg py-2.5 text-(--text-muted) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
            title={collapsed ? "Show option names" : "Hide option names"}
          >
            {collapsed ? (
              <IconChevronRight size={18} />
            ) : (
              <IconChevronLeft size={18} />
            )}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (isMobile) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 md:hidden">
        <div className="absolute inset-0 bg-black/40" aria-hidden />
        <div
          ref={panelRef}
          className="absolute left-0 top-0 flex h-full w-[84%] max-w-sm flex-col border-r border-(--border-subtle) shadow-xl"
        >
          <div className="flex-1 overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside
      className={[
        "hidden shrink-0 border-r border-(--border-subtle) md:block",
        collapsed ? "w-16" : "w-56",
      ].join(" ")}
    >
      {content}
    </aside>
  );
}
