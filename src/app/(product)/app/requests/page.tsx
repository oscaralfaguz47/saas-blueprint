import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getTenantPermissions } from "@/server/security/tenant-authorization";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestsSplitLayout } from "@/components/app/requests/requests-split-layout";

export const dynamic = "force-dynamic";

export default async function RequestsListPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) redirect("/app");

  const permissions = await getTenantPermissions({
    userId: session.user.id,
    tenantId: membership.tenant.id,
  });

  const canCreate = permissions.includes("tenant.requests.create");
  const canReadAll = permissions.includes("tenant.requests.read_all");

  const tenantCurrency = await prisma.tenant.findUnique({
    where: { id: membership.tenant.id },
    select: { currency: true },
  });

  return (
    <Suspense fallback={<RequestsPageSkeleton />}>
      <RequestsSplitLayout
        canCreate={canCreate}
        canReadAll={canReadAll}
        workspaceCurrency={tenantCurrency?.currency ?? "USD"}
        currentUserId={session.user.id}
        permissions={permissions}
      />
    </Suspense>
  );
}

function RequestsPageSkeleton() {
  return (
    <div className="flex h-full gap-0">
      <div className="flex w-full flex-col gap-4 p-4 sm:w-[420px] sm:border-r sm:border-(--border-subtle)">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="hidden flex-1 sm:flex sm:items-center sm:justify-center">
        <p className="text-sm text-(--text-muted)">Select a request to view details</p>
      </div>
    </div>
  );
}
