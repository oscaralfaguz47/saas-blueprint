import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ManageWorkspaceClient } from "@/components/app/admin/manage-workspace-client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const dynamic = "force-dynamic";

export default async function AdminWorkspaceInvitesPage({
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

  const canResetPrimaryOwner2FA = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: fullSession.user.role,
    permission: "admin.mfa.reset",
  });

  return (
    <ManageWorkspaceClient
      tenantId={tenantId}
      canResetPrimaryOwner2FA={canResetPrimaryOwner2FA}
      segment="invites"
    />
  );
}
