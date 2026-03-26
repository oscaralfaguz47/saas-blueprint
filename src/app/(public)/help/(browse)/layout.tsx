import type { ReactNode } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";

import { HelpLeftRail } from "@/components/help/help-left-rail";
import { Container } from "@/components/ui/container";
import { authOptions } from "@/server/auth-options";

export const dynamic = "force-dynamic";

export default async function PublicHelpBrowseLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;

  const inner = (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[60vh] flex-col gap-8 md:flex-row">
        <HelpLeftRail
          basePath="/help"
          showAuthLinks={isAuthenticated}
          isPublicSurface
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );

  if (isAuthenticated) {
    return inner;
  }

  // Anonymous users get the full marketing shell
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--marketing-legal-bg, #0f1117)" }}
    >
      <header
        className="border-b border-(--border-subtle)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle)"
                style={{ backgroundColor: "var(--bg-surface, #1a1f2e)" }}
              >
                <span className="text-xs font-semibold text-(--text-primary)">
                  ATL
                </span>
              </Link>
              <Link
                href="/"
                className="text-sm font-medium text-(--text-primary)"
              >
                ATL
              </Link>
            </div>
            <nav className="flex items-center gap-3">
              <Link
                href="/"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Pricing
              </Link>
              <Link
                href="/privacy"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Privacy
              </Link>
              <Link
                href="/auth/sign-in"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) px-3 text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
                style={{ backgroundColor: "var(--bg-surface, #1a1f2e)" }}
              >
                Sign in
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {inner}

      <footer
        className="border-t border-(--border-subtle)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
        <Container>
          <div className="flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-(--text-muted)">
              © {new Date().getFullYear()} ATL. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/privacy"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Privacy
              </Link>
              <Link
                href="/pricing"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Pricing
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Sign in
              </Link>
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
