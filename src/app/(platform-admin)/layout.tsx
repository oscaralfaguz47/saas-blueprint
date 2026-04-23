import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";
import { AdminSubnav } from "@/components/app/admin/admin-subnav";

export const dynamic = "force-dynamic";

export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const user = await prisma.user.findUnique({
    where: { id: fullSession.user.id },
    select: {
      isPlatformBlocked: true,
      name: true,
      email: true,
      image: true,
      profilePhotoObjectKey: true,
      appearance: true,
      role: true,
      security: {
        select: { totpEnabled: true },
      },
    },
  });
  if (!user || user.isPlatformBlocked) redirect("/unauthorized");

  // Platform Admin requires 2FA to be enabled (security policy).
  // TOTP status read from DB on every render (never trust JWT).
  if (!user.security?.totpEnabled) {
    redirect("/app/account?tab=security&vendorSetup2fa=1");
  }

  const canAccess = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: user.role ?? undefined,
    permission: "admin.tenants.read",
  });
  if (!canAccess) redirect("/unauthorized");

  const [
    canViewSupport,
    canViewKnowledgeBase,
    canViewChat,
    canViewCronJobs,
    isPlatformAdmin,
  ] = await Promise.all([
    hasVendorPermission({
      userId: fullSession.user.id,
      legacyRole: user.role ?? undefined,
      permission: "admin.support.read",
    }),
    hasVendorPermission({
      userId: fullSession.user.id,
      legacyRole: user.role ?? undefined,
      permission: "admin.knowledge_base.read",
    }),
    hasVendorPermission({
      userId: fullSession.user.id,
      legacyRole: user.role ?? undefined,
      permission: "admin.support.read",
    }),
    hasVendorPermission({
      userId: fullSession.user.id,
      legacyRole: user.role ?? undefined,
      permission: "admin.tenants.read",
    }),
    prisma.vendorUserRole.findFirst({
      where: {
        userId: fullSession.user.id,
        role: { name: "PlatformAdmin" },
      },
      select: { userId: true },
    }),
  ]);
  const canManageAdminUsers = !!isPlatformAdmin;

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
        name: user.name ?? fullSession.user.name ?? null,
        email: user.email ?? fullSession.user.email ?? null,
        image: avatarUrl,
      }}
      workspace={null}
      tenantId={null}
      pendingInvitationsCount={0}
      canAccessPlatformAdmin={true}
    >
      <div className="h-full min-h-0 w-full overflow-y-auto">
        <div className="w-full px-4 py-6">
          <AdminSubnav
            canManageAdminUsers={canManageAdminUsers}
            canViewSupport={canViewSupport}
            canViewKnowledgeBase={canViewKnowledgeBase}
            canViewChat={canViewChat}
            canViewCronJobs={canViewCronJobs}
          />
          {children}
        </div>
      </div>
    </AppLayoutHydrationGate>
  );
}
