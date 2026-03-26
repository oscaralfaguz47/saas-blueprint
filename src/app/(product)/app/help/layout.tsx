import type { ReactNode } from "react";

import { HelpLeftRail } from "@/components/help/help-left-rail";

export const dynamic = "force-dynamic";

/**
 * Authenticated Help & Support: KB + tickets under `/app/help/**` only (no public `/help` cross-links).
 */
export default async function AppHelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[60vh] flex-col gap-12 md:flex-row">
        <HelpLeftRail basePath="/app/help" showAuthLinks isPublicSurface={false} />
        <div className="min-w-0 flex-1 md:pl-6">{children}</div>
      </div>
    </div>
  );
}
