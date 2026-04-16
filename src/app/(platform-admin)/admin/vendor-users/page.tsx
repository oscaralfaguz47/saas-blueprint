import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { isBootstrapAllowlistedEmail } from "@/server/services/platform-bootstrap";
import { AdminVendorUsersClient } from "@/components/app/admin/admin-vendor-users-client";

export const dynamic = "force-dynamic";

export default async function AdminVendorUsersPage() {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const isPlatformAdmin = await prisma.vendorUserRole.findFirst({
    where: {
      userId: fullSession.user.id,
      role: { name: "PlatformAdmin" },
    },
    select: { userId: true },
  });
  if (!isPlatformAdmin) notFound();

  const currentUser = await prisma.user.findUnique({
    where: { id: fullSession.user.id },
    select: { email: true },
  });
  if (!currentUser) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">Admin Users</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Manage vendor users and platform admin roles.
      </p>
      <div className="mt-8">
        <AdminVendorUsersClient
          currentUserId={fullSession.user.id}
          isBootstrapAdmin={isBootstrapAllowlistedEmail(currentUser.email)}
        />
      </div>
    </div>
  );
}
