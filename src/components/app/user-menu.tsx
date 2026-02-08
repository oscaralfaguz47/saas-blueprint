"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  IconBilling,
  IconLogout,
  IconPlus,
  IconSettings,
  IconWorkspace,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

type TenantItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDefaultTenant: boolean;
};

type UserMenuProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

function initialsFrom(nameOrEmail: string | null) {
  if (!nameOrEmail) return "U";
  const s = nameOrEmail.trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type AnyElementRef<T extends HTMLElement> = React.RefObject<T | null>;

function useClickOutside(
  refs: AnyElementRef<HTMLElement>[],
  onOutside: () => void,
  isActive: boolean
) {
  useEffect(() => {
    if (!isActive) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      const isInside = refs.some((r) => r.current?.contains(target));
      if (!isInside) onOutside();
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [refs, onOutside, isActive]);
}

function MenuItem({
  href,
  icon,
  label,
  onSelect,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
    >
      <span className="text-(--text-muted)">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function MenuButton({
  icon,
  label,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
    >
      <span className="text-(--text-muted)">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export default function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const label = user.name || user.email || "User";
  const secondary = user.email ?? "";
  const initials = initialsFrom(user.name || user.email);

  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const menuId = useId();

  useClickOutside([buttonRef, panelRef], () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTenantsLoading(true);
    fetch("/api/tenant")
      .then((r) => r.json())
      .then((json: { data?: { tenants?: TenantItem[] } }) => {
        setTenants(json.data?.tenants ?? []);
      })
      .finally(() => setTenantsLoading(false));
  }, [open]);

  async function handleSwitchTenant(tenantId: string) {
    setSwitchingId(tenantId);
    try {
      const res = await fetch("/api/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        setOpen(false);
        router.push("/app/dashboard");
        router.refresh();
        // Overlay stays until workspace-ready event (from layout after RSC refetch) or fallback timeout
        const done = () => {
          setSwitchingId(null);
          window.removeEventListener("workspace-ready", onReady);
          clearTimeout(fallback);
        };
        const onReady = () => done();
        window.addEventListener("workspace-ready", onReady);
        const fallback = setTimeout(done, 3000);
        return;
      }
    } catch {
      // fall through to clear overlay
    }
    setSwitchingId(null);
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut({ callbackUrl: "/auth/sign-in" });
  }

  const switchingOverlay =
    switchingId !== null && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-4 bg-(--bg-app)/90 text-(--text-primary) backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-label="Switching workspace"
          >
            <Spinner size="lg" />
            <p className="text-sm text-(--text-muted)">Switching workspace…</p>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative">
      {switchingOverlay}
      {/* Trigger */}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-(--bg-surface-elev) focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
      >
        {/* Avatar */}
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt="Profile"
            className="h-9 w-9 rounded-full border border-(--border-subtle) object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-(--border-subtle) bg-(--bg-surface) text-xs font-semibold text-(--text-primary)">
            {initials}
          </div>
        )}

        {/* Label */}
        <div className="hidden min-w-0 text-left sm:block">
          <div className="truncate text-sm font-semibold text-(--text-primary)">
            {label}
          </div>
          {secondary ? (
            <div className="truncate text-xs text-(--text-muted)">{secondary}</div>
          ) : null}
        </div>

        {/* Caret */}
        <span
          aria-hidden="true"
          className={[
            "hidden text-(--text-muted) sm:inline-block",
            open ? "rotate-180" : "rotate-0",
          ].join(" ")}
          style={{ transition: "transform 120ms ease" }}
        >
          ▾
        </span>
      </button>

      {/* Menu */}
      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="User menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-lg"
        >
          {/* Header */}
          <div className="border-b border-(--border-subtle) px-4 py-3">
            <div className="text-xs font-medium text-(--text-muted)">
              Signed in as
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-(--text-primary)">
              {secondary || label}
            </div>
          </div>

          {/* Workspace */}
          <div className="py-1">
            <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
              Workspace
            </div>

            {tenantsLoading ? (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-(--text-muted)">
                <Spinner size="sm" />
                <span>Loading workspaces…</span>
              </div>
            ) : tenants.length > 0 ? (
              <div className="max-h-40 overflow-y-auto">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 px-4 py-2"
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
                        className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-(--color-primary) hover:underline disabled:opacity-60"
                      >
                        {switchingId === t.id ? (
                          <>
                            <Spinner size="sm" />
                            <span>Switching…</span>
                          </>
                        ) : (
                          "Switch to"
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <MenuItem
              href="/app/workspace/new"
              label="Create workspace"
              icon={<IconPlus size={16} />}
              onSelect={() => setOpen(false)}
            />

            <MenuItem
              href="/app/workspace/settings"
              label="Workspace settings"
              icon={<IconWorkspace size={16} />}
              onSelect={() => setOpen(false)}
            />

            <MenuItem
              href="/app/billing"
              label="Billing"
              icon={<IconBilling size={16} />}
              onSelect={() => setOpen(false)}
            />
          </div>

          <div className="border-t border-(--border-subtle)" />

          {/* Account */}
          <div className="py-1">
            <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
              Account
            </div>

            <MenuItem
              href="/app/settings"
              label="Settings"
              icon={<IconSettings size={16} />}
              onSelect={() => setOpen(false)}
            />

            <MenuButton
              label="Sign out"
              icon={<IconLogout size={16} />}
              onSelect={handleSignOut}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
