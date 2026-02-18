import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { prisma } from "@/server/db";
import { ManageWorkspaceClient } from "@/components/app/admin/manage-workspace-client";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const dynamic = "force-dynamic";

export default async function AdminManageWorkspacePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const { tenantId } = paramsSchema.parse(await params);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) notFound();

  const canResetPrimaryOwner2FA = await hasVendorPermission({
    userId: session.user.id,
    legacyRole: session.user.role,
    permission: "admin.mfa.reset",
  });

  return (
    <ManageWorkspaceClient
      tenantId={tenantId}
      canResetPrimaryOwner2FA={canResetPrimaryOwner2FA}
    />
  );
}
