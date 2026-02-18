import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getOnboardingCounts } from "@/server/services/onboarding";
import { writeAuditLog } from "@/server/services/audit";
import { checkAndUpdateSessionActivity } from "@/server/services/inactivity";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");

  const userId = session.user.id;

  // L1: Inactivity auto-logout — redirect to our sign-out page with reason so UI shows "session expired" and auto sign-out clears cookie (NextAuth GET does not pass callbackUrl to the page).
  if (session.user.sessionToken) {
    const activity = await checkAndUpdateSessionActivity(session.user.sessionToken);
    if (activity.status === "expired" || activity.status === "session_not_found") {
      redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
    }
  }

  // L1 / E6: 2FA challenge — require verification or setup before app access
  const needsMfa =
    session.user.authLevel === "PENDING_MFA" ||
    (session.user.totpEnabled && !session.user.mfaVerified);
  if (needsMfa) {
    // E6: Admin-forced 2FA not yet set up → send to dedicated setup page (avoids redirect loop; account requires full session)
    if (
      session.user.mfaEnforced &&
      !session.user.totpEnabled
    ) {
      redirect("/auth/setup-2fa");
    }
    redirect("/auth/2fa");
  }

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

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        image: true,
        profilePhotoObjectKey: true,
        appearance: true,
      },
    });
    const appearanceMode = userRecord?.appearance ?? "SYSTEM";
    const initialTheme =
      appearanceMode === "LIGHT" ? "light" : appearanceMode === "DARK" ? "dark" : "system";

    let avatarUrl: string | null = null;
    if (userRecord?.profilePhotoObjectKey && isR2Configured()) {
      avatarUrl = await getPresignedGetUrlProfilePhoto(userRecord.profilePhotoObjectKey);
    }
    if (!avatarUrl && userRecord?.image) avatarUrl = userRecord.image;

    return (
      <AppLayoutHydrationGate
        initialTheme={initialTheme}
        user={{
          name: userRecord?.name ?? session.user.name ?? null,
          email: userRecord?.email ?? session.user.email ?? null,
          image: avatarUrl,
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
    redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
  }
}
