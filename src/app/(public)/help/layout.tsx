import type { ReactNode } from "react";
import { getServerSession } from "next-auth";

import { HelpLeftRail } from "@/components/help/help-left-rail";
import { authOptions } from "@/server/auth-options";

export const dynamic = "force-dynamic";

export default async function PublicHelpLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;

  return (
    <div className="flex min-h-[60vh] flex-col gap-6 md:flex-row md:gap-8">
      <HelpLeftRail basePath="/help" showAuthLinks={isAuthenticated} isPublicSurface />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
