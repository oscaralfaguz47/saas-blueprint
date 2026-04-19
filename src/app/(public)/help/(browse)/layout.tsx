import type { ReactNode } from "react";
import { getServerSession } from "next-auth";

import { HelpLeftRail } from "@/components/help/help-left-rail";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
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
    <div className="min-h-screen bg-(--marketing-legal-bg)">
      <PublicHeader isLoggedIn={false} />
      {inner}
      <PublicFooter isLoggedIn={false} />
    </div>
  );
}
