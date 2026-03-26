import type { ReactNode } from "react";
import { getServerSession } from "next-auth";

import { HelpLeftRail } from "@/components/help/help-left-rail";
import { authOptions } from "@/server/auth-options";

export const dynamic = "force-dynamic";

export default async function PublicHelpLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[60vh] flex-col gap-8 md:flex-row">
        <HelpLeftRail basePath="/help" showAuthLinks={isAuthenticated} isPublicSurface />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
