"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import UserMenu from "@/components/app/user-menu";
import { IconMenu, IconX } from "@/components/ui/icons";

type AppHeaderProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

const NAV = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/records", label: "Records" },
  { href: "/app/members", label: "Members" },
  { href: "/app/settings", label: "Settings" },
] as const;

function isActivePath(currentPath: string, href: string) {
  // Exact match for dashboard (avoid matching everything under /app)
  if (href === "/app/dashboard") {
    return currentPath === "/app/dashboard" || currentPath === "/app";
  }

  // Prefix match for sections
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname() ?? "/app";
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (panelRef.current && !panelRef.current.contains(target)) {
        setMobileOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mobileOpen]);

  return (
    <header className="border-b border-(--border-subtle) bg-(--bg-surface)">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-4">
          <Link
            href="/app/dashboard"
            className="flex items-center gap-2 font-semibold text-(--text-primary)"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) text-sm">
              ATL
            </span>
            <span>ATL</span>
            <span className="text-xs font-medium text-(--text-muted)">/app</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-(--bg-surface-elev) text-(--text-primary)"
                      : "text-(--text-secondary) hover:bg-(--bg-surface-elev) hover:text-(--text-primary)",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Mobile button + UserMenu */}
        <div className="flex items-center gap-2">
          {/* Mobile nav trigger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-2 text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary) md:hidden"
            aria-label="Open navigation"
          >
            <IconMenu size={18} />
          </button>

          <UserMenu user={user} />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Panel */}
          <div
            ref={panelRef}
            className="absolute right-0 top-0 h-full w-[84%] max-w-sm border-l border-(--border-subtle) bg-(--bg-surface) shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-(--border-subtle) px-4 py-3">
              <div className="text-sm font-semibold text-(--text-primary)">
                Navigation
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-(--text-secondary) transition hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
                aria-label="Close navigation"
              >
                <IconX size={18} />
              </button>
            </div>

            <nav className="px-2 py-2">
              {NAV.map((item) => {
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-(--bg-surface-elev) text-(--text-primary)"
                        : "text-(--text-secondary) hover:bg-(--bg-surface-elev) hover:text-(--text-primary)",
                    ].join(" ")}
                  >
                    {/* Active indicator */}
                    <span
                      aria-hidden="true"
                      className={[
                        "mr-3 h-2 w-2 rounded-full",
                        active ? "bg-(--color-primary)" : "bg-transparent",
                      ].join(" ")}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-(--border-subtle) px-4 py-3">
              <p className="text-xs text-(--text-muted)">
                Tip: Use the user menu for workspace and billing.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
