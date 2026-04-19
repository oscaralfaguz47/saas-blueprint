import Link from "next/link";

import { Container } from "@/components/ui/container";
import { ThemeLogo } from "@/components/ui/theme-logo";

type PublicFooterProps = {
  isLoggedIn: boolean;
};

export function PublicFooter({ isLoggedIn }: PublicFooterProps) {
  const year = new Date().getFullYear();
  const accountHref = isLoggedIn ? "/app/requests" : "/auth/sign-in";
  const accountLabel = isLoggedIn ? "Go to app" : "Sign in";

  return (
    <footer className="border-t border-(--border-subtle) bg-(--bg-main)">
      <Container className="!flex !max-w-[1280px] !flex-col !gap-4 !py-10 md:!flex-row md:!items-center md:!justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/" className="flex items-center gap-2">
            <span className="relative block h-6 w-[100px] shrink-0">
              <ThemeLogo
                width={100}
                height={24}
                className="h-6 w-auto max-w-[100px] object-contain object-left"
              />
            </span>
          </Link>
          <p className="text-xs text-(--text-muted)">
            © {year} Relitrue. All rights reserved.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <Link
            href="/privacy"
            className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
          >
            Terms
          </Link>
          <Link
            href={accountHref}
            className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
          >
            {accountLabel}
          </Link>
        </div>
      </Container>
    </footer>
  );
}
