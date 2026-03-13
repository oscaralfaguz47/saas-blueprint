"use client";

import Link from "next/link";
import UserMenu from "@/components/app/user-menu";
import { IconBell, IconMenu } from "@/components/ui/icons";

type Workspace = {
  id: string;
  name: string;
  logoObjectKey?: string | null;
};

type AppHeaderProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  workspace: Workspace | null;
  /** A5: Show "You have X pending workspace invitations" link to /invitations */
  pendingInvitationsCount?: number;
  onMenuClick?: () => void;
};

function workspaceInitials(name: string): string {
  const s = name.trim();
  if (!s) return "WS";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return s.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AppHeader({
  user,
  workspace,
  pendingInvitationsCount = 0,
  onMenuClick,
}: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-(--border-subtle) bg-(--bg-surface)">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4">
        {/* Left: Mobile menu + Workspace context */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-(--border-subtle) bg-(--bg-surface) p-2 text-(--text-secondary) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] hover:text-(--text-primary) md:hidden"
              aria-label="Open menu"
            >
              <IconMenu size={18} />
            </button>
          ) : null}

          {workspace ? (
            <div className="flex min-w-0 items-center gap-2">
              {workspace.logoObjectKey ? (
                <img
                  src={`/api/tenant/${workspace.id}/logo?v=${encodeURIComponent(workspace.logoObjectKey)}`}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-md border border-(--border-subtle) object-cover"
                />
              ) : (
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--border-subtle) bg-[color-mix(in_srgb,var(--color-text-primary)_10%,transparent)] text-xs font-semibold text-(--text-primary) uppercase">
                  {workspaceInitials(workspace.name)}
                </span>
              )}
              <span
                className="max-w-72 min-w-0 truncate text-sm font-semibold text-(--text-primary)"
                title={workspace.name}
              >
                {workspace.name}
              </span>
            </div>
          ) : (
            <span className="text-sm text-(--text-muted)">Workspace</span>
          )}
        </div>

        {/* Right: Pending invitations badge + Notifications + User menu */}
        <div className="flex shrink-0 items-center gap-2">
          {pendingInvitationsCount > 0 ? (
            <Link
              href="/invitations"
              className="inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-2.5 py-1.5 text-xs font-medium text-(--color-primary) transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
            >
              {pendingInvitationsCount} pending invitation{pendingInvitationsCount !== 1 ? "s" : ""}
            </Link>
          ) : null}
          <button
            type="button"
            aria-label="Notifications"
            className="inline-flex items-center justify-center rounded-md p-2 text-(--text-secondary) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] hover:text-(--text-primary)"
          >
            <IconBell size={18} />
          </button>
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
