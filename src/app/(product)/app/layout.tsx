import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getOnboardingCounts } from "@/server/services/onboarding";
import { writeAuditLog } from "@/server/services/audit";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");

  const userId = session.user.id;

  try {
    const { activeMembershipCount, pendingInvitationsCount } =
      await getOnboardingCounts(userId);

    if (activeMembershipCount === 0) {
      if (pendingInvitationsCount > 0) {
        await writeAuditLog({
          actorUserId: userId,
          actorContext: "TENANT",
          action: "onboarding.redirected_to_choose",
          metadata: { pendingInvitationsCount },
        });
        redirect("/setup/choose");
      }
      redirect("/setup/workspace");
    }

    const membership = await getDefaultTenantForUser(userId);
    if (!membership) redirect("/setup/workspace");

    if (membership.tenant.status === "DRAFT") {
      redirect("/setup/workspace");
    }

    const tenantId = membership.tenant.id;
    const workspace = {
      id: membership.tenant.id,
      name: membership.tenant.name,
      logoObjectKey: membership.tenant.logoObjectKey ?? null,
    };

    return (
      <AppLayoutHydrationGate
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
        }}
        workspace={workspace}
        tenantId={tenantId}
        pendingInvitationsCount={pendingInvitationsCount}
      >
        {children}
      </AppLayoutHydrationGate>
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("AppLayout data fetch error:", error);
    redirect("/api/auth/signout?callbackUrl=/auth/sign-in");
  }
}
