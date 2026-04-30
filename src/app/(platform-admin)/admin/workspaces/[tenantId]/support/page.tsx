import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { z } from "zod";

import { WorkspaceSupportClient } from "@/components/app/admin/workspace-support-client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const dynamic = "force-dynamic";

export default async function AdminWorkspaceSupportPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const { tenantId } = paramsSchema.parse(await params);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) notFound();

  const canView = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.support.read",
  });
  if (!canView) notFound();

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-(--text-primary)">Workspace support tickets</h2>
      <WorkspaceSupportClient tenantId={tenantId} />
    </div>
  );
}
