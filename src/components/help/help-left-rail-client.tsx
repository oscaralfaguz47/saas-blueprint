"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { IconChatBubble, IconChevronRight, IconMenu, IconX } from "@/components/ui/icons";
import { dispatchOpenChatWidget } from "@/components/help/open-chat-widget-trigger";

const activeBg =
  "bg-(--nav-active) shadow-sm ring-1 ring-inset ring-(--color-primary-soft)/50 font-medium text-(--text-primary)";
const hoverBg = "hover:bg-(--nav-hover) hover:text-(--text-primary)";

export type HelpLeftRailCategory = {
  slug: string;
  name: string;
  articles: { slug: string; title: string }[];
};

export type HelpLeftRailClientProps = {
  basePath: "/help" | "/app/help";
  showAuthLinks: boolean;
  /** Show link to `/help/new` on the public help surface. */
  showPublicGetInTouch?: boolean;
  categories: HelpLeftRailCategory[];
};

function NavLink({
  href,
  active,
  children,
  className = "",
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
        active ? activeBg : `text-(--text-secondary) ${hoverBg}`
      } ${className}`}
    >
      {children}
    </Link>
  );
}

function HelpNavContent({
  basePath,
  showAuthLinks,
  showPublicGetInTouch,
  categories,
}: HelpLeftRailClientProps) {
  const pathname = usePathname() ?? "";
  const getInitialExpandedSlug = () => {
    for (const c of categories) {
      for (const a of c.articles) {
        const href = `${basePath}/article/${a.slug}`;
        if (pathname === href || pathname.startsWith(`${href}/`)) {
          return c.slug;
        }
      }
      // Also expand if we're on the category page itself
      const categoryHref = `${basePath}/category/${c.slug}`;
      if (pathname === categoryHref || pathname.startsWith(`${categoryHref}/`)) {
        return c.slug;
      }
    }
    return null;
  };

  const [expandedSlug, setExpandedSlug] = useState<string | null>(getInitialExpandedSlug);

  useEffect(() => {
    const slug = getInitialExpandedSlug();
    if (slug) setExpandedSlug(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync accordion to URL path only
  }, [pathname]);

  const inboxActive = pathname === `${basePath}/inbox`;
  const newActive = pathname === `${basePath}/new`;
  const getInTouchActive = pathname === "/help/new";

  const toggleCategory = (slug: string) => {
    setExpandedSlug((prev) => (prev === slug ? null : slug));
  };

  return (
    <div className="flex flex-col gap-0 pt-1">
      <div className="text-quiet-uppercase px-2 pb-2 text-[11px] font-semibold tracking-wide text-(--text-muted)">
        Help &amp; Support
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Help section">
        <button
          type="button"
          onClick={() => dispatchOpenChatWidget()}
          aria-label="Open AI Assistant chat"
          className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-soft) text-(--text-secondary) ${hoverBg}`}
        >
          <span className="flex items-center gap-2">
            <IconChatBubble size={16} className="shrink-0 opacity-80" />
            AI Assistant
          </span>
        </button>
        {showPublicGetInTouch ? (
          <NavLink href="/help/new" active={getInTouchActive}>
            Get in touch
          </NavLink>
        ) : null}
        {showAuthLinks ? (
          <>
            <div className="my-2 border-t border-(--border-subtle)" aria-hidden />
            <NavLink href={`${basePath}/inbox`} active={inboxActive}>
              Inbox
            </NavLink>
            <NavLink href={`${basePath}/new`} active={newActive}>
              New request
            </NavLink>
          </>
        ) : null}
      </nav>

      {categories.length > 0 ? (
        <>
          <div className="my-3 border-t border-(--border-subtle)" aria-hidden />
          <div className="text-quiet-uppercase px-2 pb-2 text-[11px] font-semibold tracking-wide text-(--text-muted)">
            Categories
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Help categories">
            {categories.map((c) => {
              const expanded = expandedSlug === c.slug;
              return (
                <div key={c.slug} className="rounded-lg transition-all duration-150">
                  <button
                    type="button"
                    onClick={() => toggleCategory(c.slug)}
                    aria-expanded={expanded}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                      expanded
                        ? activeBg
                        : `text-(--text-secondary) ${hoverBg}`
                    }`}
                  >
                    <IconChevronRight
                      size={16}
                      className={`shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                    <span className="min-w-0 font-medium">{c.name}</span>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-150 ${expanded ? "mt-1 max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}
                  >
                    <ul className="space-y-0.5 border-l border-(--border-subtle) pl-2 ml-4 py-1">
                      {c.articles.map((a) => {
                        const href = `${basePath}/article/${a.slug}`;
                        const active =
                          pathname === href || pathname.startsWith(`${href}/`);
                        return (
                          <li key={a.slug}>
                            <Link
                              href={href}
                              className={`block rounded-md py-1.5 pl-2 pr-2 text-xs transition-colors ${
                                active
                                  ? "bg-(--nav-active) font-medium text-(--color-primary)"
                                  : `text-(--text-secondary) ${hoverBg}`
                              }`}
                            >
                              {a.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </nav>
        </>
      ) : null}
    </div>
  );
}

export function HelpLeftRailClient(props: HelpLeftRailClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="mb-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          className="flex w-full items-center justify-between rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm font-medium text-(--text-primary) shadow-sm"
        >
          <span className="flex items-center gap-2">
            <IconMenu size={18} />
            Help menu
          </span>
          {mobileOpen ? <IconX size={18} /> : null}
        </button>
        {mobileOpen ? (
          <div className="mt-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3 shadow-sm">
            <HelpNavContent {...props} />
          </div>
        ) : null}
      </div>

      <aside className="hidden w-56 shrink-0 border-r border-(--border-subtle) pr-4 md:block">
        <HelpNavContent {...props} />
      </aside>
    </>
  );
}
