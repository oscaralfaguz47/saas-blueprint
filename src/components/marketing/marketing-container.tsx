import type { ReactNode } from "react";

/**
 * Marketing/public-page horizontal container.
 *
 * Mirrors the API of the shared `Container` primitive but adds `mx-auto`
 * so content is properly centered within the viewport on wide screens.
 *
 * Scope: public-facing marketing and legal pages only
 * (landing, pricing, terms, privacy, checkout, public header, public footer).
 *
 * Do NOT use this in authenticated app surfaces — those continue to use
 * the shared `Container` primitive at `src/components/ui/container.tsx`.
 */
export function MarketingContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}
