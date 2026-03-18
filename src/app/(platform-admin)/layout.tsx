import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { checkAndUpdateSessionActivity } from "@/server/services/inactivity";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";

export const dynamic = "force-dynamic";

export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");

  if (session.user.sessionToken) {
    const activity = await checkAndUpdateSessionActivity(session.user.sessionToken);
    if (activity.status === "expired" || activity.status === "session_not_found") {
      redirect("/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired");
    }
  }

  const needsMfa =
    session.user.authLevel === "PENDING_MFA" ||
    (session.user.totpEnabled && !session.user.mfaVerified);
  if (needsMfa) {
    if (session.user.mfaEnforced && !session.user.totpEnabled) {
      redirect("/auth/setup-2fa");
    }
    redirect("/auth/2fa");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPlatformBlocked: true,
      name: true,
      email: true,
      image: true,
      profilePhotoObjectKey: true,
      appearance: true,
      role: true,
    },
  });
  if (!user || user.isPlatformBlocked) redirect("/unauthorized");

  // Platform Admin requires 2FA to be enabled (security policy)
  const security = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: { totpEnabled: true },
  });
  if (!security?.totpEnabled) redirect("/unauthorized");

  const canAccess = await hasVendorPermission({
    userId: session.user.id,
    legacyRole: user.role ?? undefined,
    permission: "admin.tenants.read",
  });
  if (!canAccess) redirect("/unauthorized");

  const appearanceMode = user.appearance ?? "SYSTEM";
  const initialTheme: "light" | "dark" | "system" =
    appearanceMode === "LIGHT" ? "light" : appearanceMode === "DARK" ? "dark" : "system";

  let avatarUrl: string | null = null;
  if (user.profilePhotoObjectKey && isR2Configured()) {
    avatarUrl = await getPresignedGetUrlProfilePhoto(user.profilePhotoObjectKey);
  }
  if (!avatarUrl && user.image) avatarUrl = user.image;

  return (
    <AppLayoutHydrationGate
      initialTheme={initialTheme}
      user={{
        name: user.name ?? session.user.name ?? null,
        email: user.email ?? session.user.email ?? null,
        image: avatarUrl,
      }}
      workspace={null}
      tenantId={null}
      pendingInvitationsCount={0}
      canAccessPlatformAdmin={true}
    >
      {children}
    </AppLayoutHydrationGate>
  );
}
