import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { NewRequestOpenModalClient } from "@/components/app/requests/new-request-open-modal-client";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) redirect("/app");

  const canCreate = await hasTenantPermission({
    userId: session.user.id,
    tenantId: membership.tenant.id,
    permission: "tenant.requests.create",
  });
  if (!canCreate) redirect("/app/requests");

  return <NewRequestOpenModalClient />;
}
