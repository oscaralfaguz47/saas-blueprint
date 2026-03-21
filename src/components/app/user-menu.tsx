"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLogout, IconSettings } from "@/components/ui/icons";
import { useTheme } from "@/components/theme/theme-provider";
import { useApiFetch } from "@/hooks/use-api-fetch";

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
  isActive: boolean,
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
      className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-(--text-secondary) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] hover:text-(--text-primary)"
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
      className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-(--text-secondary) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] hover:text-(--text-primary)"
    >
      <span className="text-(--text-muted)">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export default function UserMenu({ user }: UserMenuProps) {
  const label = user.name || user.email || "User";
  const secondary = user.email ?? "";
  const initials = initialsFrom(user.name || user.email);

  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const apiFetch = useApiFetch();
  const router = useRouter();
  const [themeSaving, setThemeSaving] = useState(false);

  const isDark = theme === "dark";

  async function handleThemeToggle() {
    if (themeSaving) return;
    const next = isDark ? "light" : "dark";
    setTheme(next);
    setThemeSaving(true);
    try {
      const res = await apiFetch("/api/account/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next === "light" ? "LIGHT" : "DARK" }),
      });
      if (!res.ok) throw new Error("appearance_failed");
      router.refresh();
    } catch {
      setTheme(isDark ? "dark" : "light");
    } finally {
      setThemeSaving(false);
    }
  }

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

  async function handleSignOut() {
    setOpen(false);
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfRes.json() as { csrfToken: string };
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/auth/sign-in" }),
        redirect: "manual",
      });
    } catch {
      // Best-effort
    }
    window.location.href = "/auth/sign-in";
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] focus:ring-2 focus:ring-(--color-primary) focus:outline-none"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt="Profile"
            className="h-9 w-9 rounded-full border border-(--border-subtle) object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--color-text-primary)_10%,transparent)] text-xs font-semibold text-(--text-primary)">
            {initials}
          </div>
        )}

        <div className="hidden max-w-[12rem] min-w-0 text-left sm:block">
          <div className="truncate text-sm font-semibold text-(--text-primary)" title={label}>
            {label}
          </div>
          {secondary ? (
            <div className="truncate text-xs text-(--text-muted)" title={secondary}>
              {secondary}
            </div>
          ) : null}
        </div>

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

      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="User menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) shadow-xl"
        >
          <div className="border-b border-(--border-subtle) px-4 py-3">
            <div className="text-xs font-medium text-(--text-muted)">Signed in as</div>
            <div className="mt-1 truncate text-sm font-semibold text-(--text-primary)">
              {secondary || label}
            </div>
          </div>

          <div className="py-1">
            <div
              className="flex items-center justify-between px-4 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex items-center gap-1.5 text-sm text-(--text-secondary)">
                  {isDark ? "Dark" : "Light"}
                  {themeSaving && (
                    <svg
                      className="h-3 w-3 animate-spin text-(--text-muted)"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  )}
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={!isDark}
                aria-label="Toggle theme"
                disabled={themeSaving}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleThemeToggle}
                className="relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center justify-between rounded-full px-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:ring-offset-2 focus:ring-offset-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-text-primary) 15%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-text-primary) 20%, transparent)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute h-6 w-6 rounded-full transition-all duration-200 ease-in-out"
                  style={{
                    left: isDark ? "2px" : "calc(100% - 26px)",
                    top: "50%",
                    transform: "translateY(-50%)",
                    backgroundColor: "var(--color-primary)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  }}
                />

                <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: isDark ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)" }}
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </span>

                <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)" }}
                  >
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                </span>
              </button>
            </div>

            <div className="my-1 border-t border-(--border-subtle)" />

            <MenuItem
              href="/app/account"
              label="My Account"
              icon={<IconSettings size={16} />}
              onSelect={() => setOpen(false)}
            />

            <MenuButton label="Sign out" icon={<IconLogout size={16} />} onSelect={handleSignOut} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
