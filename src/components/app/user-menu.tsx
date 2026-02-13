"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { IconLogout, IconSettings } from "@/components/ui/icons";

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
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)]"
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
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
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)]"
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export default function UserMenu({ user }: UserMenuProps) {
  const label = user.name || user.email || "User";
  const secondary = user.email ?? "";
  const initials = initialsFrom(user.name || user.email);

  const [open, setOpen] = useState(false);
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
    await signOut({ callbackUrl: "/auth/sign-in" });
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
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt="Profile"
            className="h-9 w-9 rounded-full border border-[var(--border-subtle)] object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-xs font-semibold text-[var(--text-primary)]">
            {initials}
          </div>
        )}

        <div className="hidden min-w-0 max-w-[12rem] text-left sm:block">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]" title={label}>
            {label}
          </div>
          {secondary ? (
            <div className="truncate text-xs text-[var(--text-muted)]" title={secondary}>
              {secondary}
            </div>
          ) : null}
        </div>

        <span
          aria-hidden="true"
          className={[
            "hidden text-[var(--text-muted)] sm:inline-block",
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
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elev)] shadow-xl"
        >
          <div className="border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="text-xs font-medium text-[var(--text-muted)]">
              Signed in as
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">
              {secondary || label}
            </div>
          </div>

          <div className="py-1">
            <MenuItem
              href="/app/account"
              label="My Account"
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
