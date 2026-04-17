import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getTenantPermissions } from "@/server/security/tenant-authorization";
import { getHighestRoleName } from "@/server/security/authority";
import { prisma } from "@/server/db";
import { Container } from "@/components/ui/container";
import Link from "next/link";
import { WorkspaceSettingsTabs } from "@/components/app/settings/workspace-settings-tabs";
import { Skeleton } from "@/components/ui/skeleton";

const WORKSPACE_SETTINGS_PERMISSIONS = [
  "tenant.settings.manage",
  "tenant.users.read",
  "tenant.billing.manage",
  "tenant.financial_config.manage",
] as const;

export default async function WorkspaceSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenantId;
  if (!tenantId) {
    return (
      <Container>
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-(--text-primary)">
            Workspace Settings
          </h1>
          <p className="text-sm text-(--text-secondary)">
            Create or select a workspace to manage settings.
          </p>
          <Link
            href="/app"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Go to app
          </Link>
        </div>
      </Container>
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      logoObjectKey: true,
      timezone: true,
      currency: true,
      dateFormat: true,
      description: true,
    },
  });
  if (!tenant) {
    return (
      <Container>
        <p className="text-sm text-(--text-secondary)">Workspace not found.</p>
      </Container>
    );
  }

  const [permissions, currentUserMembership] = await Promise.all([
    getTenantPermissions({
      userId: session.user.id,
      tenantId: tenant.id,
    }),
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
      select: { roles: { select: { role: { select: { name: true } } } } },
    }),
  ]);
  const canAccessAnyTab = WORKSPACE_SETTINGS_PERMISSIONS.some((p) =>
    permissions.includes(p)
  );
  if (!canAccessAnyTab) redirect("/unauthorized");

  const currentUserRole =
    getHighestRoleName(
      currentUserMembership?.roles.map((r) => r.role.name) ?? []
    ) ?? "Member";

  return (
    <Suspense
      fallback={
        <Container>
          <div className="space-y-6">
            <Skeleton className="h-7 w-48" />
            <div className="flex gap-1 border-b border-(--border-subtle)">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-24 shrink" />
              ))}
            </div>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          </div>
        </Container>
      }
    >
      <WorkspaceSettingsTabs
        tenant={tenant}
        permissions={permissions}
        currentUserId={session.user.id}
        currentUserRole={currentUserRole}
      />
    </Suspense>
  );
}
