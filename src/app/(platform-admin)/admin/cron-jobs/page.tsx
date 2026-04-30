import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { AdminCronJobsClient } from "@/components/app/admin/admin-cron-jobs-client";

export const dynamic = "force-dynamic";

export default async function AdminCronJobsPage() {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canView = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.tenants.read",
  });
  if (!canView) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">Cron Jobs</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Manually trigger scheduled jobs. Use this for local development and testing only.
      </p>
      <div className="mt-8">
        <AdminCronJobsClient />
      </div>
    </div>
  );
}
