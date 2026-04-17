import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminWorkspaceSectionNav } from "@/components/app/admin/admin-workspace-section-nav";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export default async function AdminWorkspaceTenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canReadTenants = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: fullSession.user.role,
    permission: "admin.tenants.read",
  });
  if (!canReadTenants) notFound();

  const { tenantId } = paramsSchema.parse(await params);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      slug: true,
      status: true,
      timezone: true,
      currency: true,
      dateFormat: true,
      description: true,
    },
  });
  if (!tenant) notFound();

  const base = `/admin/workspaces/${tenantId}`;
  const tabs = [
    { href: base, label: "Members" },
    { href: `${base}/invites`, label: "Invites" },
    { href: `${base}/support`, label: "Support" },
    { href: `${base}/billing`, label: "Billing" },
  ] as const;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-(--text-muted)">
        <Link href="/admin/workspaces" className="hover:text-(--text-primary)">
          Workspaces
        </Link>
        <span>/</span>
        <span className="text-(--text-primary)">Manage</span>
      </div>
      <AdminWorkspaceSectionNav membersRootHref={base} tabs={tabs} />
      <div className="space-y-6">
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
          <h1 className="text-2xl font-semibold text-(--text-primary)">{tenant.name}</h1>
          <dl className="mt-3 grid gap-1 text-sm">
            <div>
              <span className="text-(--text-muted)">Slug: </span>
              <span>{tenant.slug}</span>
            </div>
            <div>
              <span className="text-(--text-muted)">Status: </span>
              <span>{tenant.status}</span>
            </div>
            {tenant.timezone && (
              <div>
                <span className="text-(--text-muted)">Timezone: </span>
                <span>{tenant.timezone}</span>
              </div>
            )}
            {tenant.currency && (
              <div>
                <span className="text-(--text-muted)">Currency: </span>
                <span>{tenant.currency}</span>
              </div>
            )}
            {tenant.dateFormat && (
              <div>
                <span className="text-(--text-muted)">Date format: </span>
                <span>{tenant.dateFormat}</span>
              </div>
            )}
            {tenant.description && (
              <div>
                <span className="text-(--text-muted)">Description: </span>
                <span>{tenant.description}</span>
              </div>
            )}
          </dl>
        </div>
        {children}
      </div>
    </div>
  );
}
