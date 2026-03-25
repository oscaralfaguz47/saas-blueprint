"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceSectionTab = { href: string; label: string };

function isTabActive(pathname: string, tabHref: string, membersRootHref: string): boolean {
  if (tabHref === membersRootHref) {
    return (
      pathname === tabHref ||
      pathname === `${tabHref}/members` ||
      pathname.startsWith(`${tabHref}/members/`)
    );
  }
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}

type Props = {
  membersRootHref: string;
  tabs: readonly WorkspaceSectionTab[];
};

export function AdminWorkspaceSectionNav({ membersRootHref, tabs }: Props) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="mb-4 flex flex-wrap gap-2 border-b border-(--border-subtle) pb-3"
      aria-label="Workspace sections"
    >
      {tabs.map((t) => {
        const active = isTabActive(pathname, t.href, membersRootHref);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-(--nav-active) text-(--text-primary) ring-1 ring-inset ring-(--color-primary-soft)/50"
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
