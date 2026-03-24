import type { ReactNode } from "react";

import { HelpLeftRail } from "@/components/help/help-left-rail";

export const dynamic = "force-dynamic";

/**
 * Authenticated Help & Support: KB + tickets under `/app/help/**` only (no public `/help` cross-links).
 */
export default async function AppHelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col gap-6 md:flex-row md:gap-8">
      <HelpLeftRail basePath="/app/help" showAuthLinks isPublicSurface={false} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
