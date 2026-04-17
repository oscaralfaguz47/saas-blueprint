"use client";

import { NotificationsBell } from "@/components/app/notifications-bell";
import UserMenu from "@/components/app/user-menu";
import { IconMenu } from "@/components/ui/icons";

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
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) transition-colors duration-150 hover:bg-(--bg-surface-hover) hover:text-(--text-primary) shadow-sm md:hidden"
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
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--border-strong) bg-(--bg-surface-hover) text-xs font-bold text-(--text-primary) uppercase shadow-sm">
                  {workspaceInitials(workspace.name)}
                </span>
              )}
              <span
                className="max-w-72 min-w-0 truncate text-sm font-semibold tracking-tight text-(--text-primary)"
                title={workspace.name}
              >
                {workspace.name}
              </span>
            </div>
          ) : null}
        </div>

        {/* Right: Notifications + User menu */}
        <div className="flex shrink-0 items-center gap-2">
          <NotificationsBell />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
