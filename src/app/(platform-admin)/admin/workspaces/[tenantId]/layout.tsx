import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { z } from "zod";

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
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  const base = `/admin/workspaces/${tenantId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/invites`, label: "Invites" },
    { href: `${base}/support`, label: "Support" },
  ] as const;

  return (
    <div>
      <nav className="mb-4 flex flex-wrap gap-2 border-b border-(--border-subtle) pb-3" aria-label="Workspace sections">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:bg-(--nav-hover) hover:text-(--text-primary)"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
