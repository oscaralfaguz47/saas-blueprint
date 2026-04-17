"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminSubnavProps = {
  canManageAdminUsers?: boolean;
  canViewSupport?: boolean;
  canViewKnowledgeBase?: boolean;
  canViewChat?: boolean;
  canViewCronJobs?: boolean;
};

export function AdminSubnav({
  canManageAdminUsers = false,
  canViewSupport = false,
  canViewKnowledgeBase = false,
  canViewChat = false,
  canViewCronJobs = false,
}: AdminSubnavProps) {
  const pathname = usePathname() ?? "";

  const allTabs = [
    { href: "/admin/workspaces", label: "Workspaces", visible: true },
    { href: "/admin/support", label: "Support", visible: canViewSupport },
    { href: "/admin/knowledge-base", label: "Knowledge Base", visible: canViewKnowledgeBase },
    { href: "/admin/chat", label: "Chat History", visible: canViewChat },
    { href: "/admin/cron-jobs", label: "Cron Jobs", visible: canViewCronJobs },
    { href: "/admin/vendor-users", label: "Admin Users", visible: canManageAdminUsers },
  ];

  const tabs = allTabs.filter((t) => t.visible);

  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b border-(--border-subtle) pb-3"
      aria-label="Platform admin sections"
    >
      {tabs.map((t) => {
        const active =
          t.href === "/admin/workspaces"
            ? pathname.startsWith("/admin/workspaces")
            : t.href === "/admin/chat"
              ? pathname === "/admin/chat" || pathname.startsWith("/admin/chat/")
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-(--nav-active) text-(--text-primary) ring-1 ring-inset ring-primary-soft/50"
                : "text-(--text-secondary) hover:bg-(--nav-hover) hover:text-(--text-primary)",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
