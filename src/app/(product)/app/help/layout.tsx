import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { HelpLeftRail } from "@/components/help/help-left-rail";

export const dynamic = "force-dynamic";

export default async function AppHelpLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) {
    redirect("/app");
  }

  return (
    <div className="h-full min-h-0 max-w-6xl overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[60vh] flex-col gap-12 md:flex-row">
        <HelpLeftRail basePath="/app/help" showAuthLinks isPublicSurface={false} />
        <div className="min-w-0 flex-1 md:pl-6">{children}</div>
      </div>
    </div>
  );
}
