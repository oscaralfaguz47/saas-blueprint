import Link from "next/link";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { ThemeLogo } from "@/components/ui/theme-logo";

type PublicHeaderProps = {
  isLoggedIn: boolean;
};

export function PublicHeader({ isLoggedIn }: PublicHeaderProps) {
  const ctaHref = isLoggedIn ? "/app/requests" : "/auth/sign-in";
  const ctaLabel = isLoggedIn ? "Go to app" : "Get started";

  return (
    <header
      className="sticky top-0 z-50 h-16 border-b border-(--border-subtle) bg-(--bg-main) supports-[backdrop-filter]:bg-(--bg-main)/80 supports-[backdrop-filter]:backdrop-blur-md"
    >
      <MarketingContainer className="!flex !h-full !max-w-[1280px] !items-center !justify-between !py-0">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">
          <span className="relative block h-7 w-[120px] shrink-0">
            <ThemeLogo
              width={120}
              height={28}
              className="h-7 w-auto max-w-[120px] object-contain object-left"
              priority
            />
          </span>
        </Link>

        <div className="flex items-center gap-3 md:gap-6">
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/help"
              className="text-sm text-(--text-secondary) transition-colors hover:text-(--text-primary)"
            >
              Get in touch
            </Link>
            <Link
              href="/terms"
              className="hidden text-sm text-(--text-secondary) transition-colors hover:text-(--text-primary) lg:inline"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="hidden text-sm text-(--text-secondary) transition-colors hover:text-(--text-primary) lg:inline"
            >
              Privacy
            </Link>
          </nav>

          <Link
            href="/pricing"
            className="hidden rounded-md border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:text-(--text-primary) md:inline-flex md:items-center md:justify-center"
          >
            View pricing
          </Link>
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            {ctaLabel}
          </Link>
        </div>
      </MarketingContainer>
    </header>
  );
}
