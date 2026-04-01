import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminWorkspaceBillingTab } from "@/components/app/admin/admin-workspace-billing-tab";
import { authOptions } from "@/server/auth-options";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const dynamic = "force-dynamic";

export default async function AdminWorkspaceBillingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await getServerSession(authOptions);
  await requireFullSessionRsc(session);

  const canReadBilling = await hasVendorPermission({
    userId: session!.user.id,
    legacyRole: session!.user.role,
    permission: "admin.billing.read",
  });
  if (!canReadBilling) notFound();

  const { tenantId } = paramsSchema.parse(await params);

  return <AdminWorkspaceBillingTab tenantId={tenantId} />;
}
