"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

type AppHeaderProps = {
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

export default function AppHeader({ user }: AppHeaderProps) {
  const label = user.name || user.email || "User";
  const initials = initialsFrom(user.name || user.email);

  async function handleSignOut() {
    await signOut({ callbackUrl: "/auth/sign-in" });
  }

  return (
    <header className="border-b border-(--border-subtle) bg-(--bg-main)">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/app/dashboard" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface)">
              <span className="text-xs font-semibold text-(--text-primary)">
                ATL
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-(--text-primary)">
                ATL
              </span>
              <span className="hidden text-xs text-(--text-muted) sm:inline">
                /app
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-4 text-sm md:flex">
            <Link
              href="/app/records"
              className="text-(--text-secondary) hover:text-(--text-primary)"
            >
              Records
            </Link>
            <Link
              href="/app/members"
              className="text-(--text-secondary) hover:text-(--text-primary)"
            >
              Members
            </Link>
            <Link
              href="/app/settings"
              className="text-(--text-secondary) hover:text-(--text-primary)"
            >
              Settings
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
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

          {/* User label */}
          <div className="hidden sm:block">
            <div className="text-sm font-medium leading-4 text-(--text-primary)">
              {label}
            </div>
            {user.email ? (
              <div className="text-xs text-(--text-muted)">{user.email}</div>
            ) : null}
          </div>

          <button
            onClick={handleSignOut}
            className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm font-medium text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
            type="button"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
