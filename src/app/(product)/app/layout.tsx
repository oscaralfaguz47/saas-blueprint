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
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { cookies } from "next/headers";
import { trySkipMfaWithRememberedDevice } from "@/server/services/mfa-skip";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";

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
    const upgraded = await trySkipMfaWithRememberedDevice(session, await cookies());
    if (upgraded) {
      // If upgraded, the session in memory is still old. Redirect to self to pick up new session from DB.
      // This is 1 hop, but prevents jumping to /auth/2fa and back.
      redirect("/app/requests");
    }

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
    const canAccessPlatformAdmin = await hasVendorPermission({
      userId,
      legacyRole: session.user.role,
      permission: "admin.tenants.read",
    });

    let { activeMembershipCount, pendingInvitationsCount } = await getOnboardingCounts(userId);

    // Auto-create workspace for new users who don't have one yet
    if (activeMembershipCount === 0 && pendingInvitationsCount === 0 && !canAccessPlatformAdmin) {
      try {
        await ensureDraftWorkspaceForUser({
          userId,
          userEmail: session.user.email,
        });
      } catch (err) {
        const code = err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
        if (code === "USER_NOT_FOUND") {
          // Race condition: adapter may not have persisted user yet
          // Wait and retry once before giving up
          await new Promise((r) => setTimeout(r, 500));
          try {
            await ensureDraftWorkspaceForUser({
              userId,
              userEmail: session.user.email,
            });
          } catch {
            redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
          }
        } else {
          throw err;
        }
      }
      // Don't redirect — let layout continue; refresh counts so we don't hit the
      // "no workspace" branch below with stale activeMembershipCount === 0.
      const refreshed = await getOnboardingCounts(userId);
      activeMembershipCount = refreshed.activeMembershipCount;
      pendingInvitationsCount = refreshed.pendingInvitationsCount;
    }

    // If no workspaces, redirect to appropriate destination
    if (activeMembershipCount === 0) {
      if (canAccessPlatformAdmin) {
        // Platform Admin without workspace — allow access to app shell.
        // Destination routing (e.g. → /admin/workspaces) is handled by
        // /app/page.tsx, not here. This layout only provides the shell.
      } else if (pendingInvitationsCount > 0) {
        await writeAuditLog({
          actorUserId: userId,
          actorContext: "TENANT",
          action: "onboarding.redirected_to_choose",
          metadata: { pendingInvitationsCount },
        });
        redirect("/setup/choose");
      } else {
        redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
      }
    }

    const membership = await getDefaultTenantForUser(userId);
    if (!membership) {
      if (canAccessPlatformAdmin) {
        // PlatformAdmin with no workspace — render app shell without tenant context
        // They'll see Account Settings to set up 2FA
        // Pass null membership through to the shell
      } else {
        redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
      }
    }

    // Welcome banner: user's own auto-created workspace only (not the active switch target)
    const ownWorkspaceMembership = await prisma.tenantMembership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        welcomeBannerDismissedAt: null,
        tenant: {
          status: "ACTIVE",
          createdByUserId: userId,
          claimedAt: { not: null },
        },
      },
      select: {
        tenantId: true,
        welcomeBannerDismissedAt: true,
        tenant: {
          select: {
            name: true,
            claimedAt: true,
          },
        },
      },
    });

    const showWelcomeBanner = !!ownWorkspaceMembership;
    const bannerWorkspaceName = ownWorkspaceMembership?.tenant.name ?? null;
    const bannerTenantId = ownWorkspaceMembership?.tenantId ?? null;

    const tenantId = membership?.tenant.id ?? null;
    const workspace = membership
      ? {
          id: membership.tenant.id,
          name: membership.tenant.name,
          logoObjectKey: membership.tenant.logoObjectKey ?? null,
        }
      : null;

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
    const initialTheme: "light" | "dark" | "system" =
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
        canAccessPlatformAdmin={canAccessPlatformAdmin}
        showWelcomeBanner={showWelcomeBanner}
        workspaceName={bannerWorkspaceName}
        bannerTenantId={bannerTenantId}
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
