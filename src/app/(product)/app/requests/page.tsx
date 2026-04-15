import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getTenantPermissions } from "@/server/security/tenant-authorization";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestsListClient } from "@/components/app/requests/requests-list-client";

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

  return (
    <Container>
      <Suspense fallback={<RequestsListSkeleton />}>
        <RequestsListClient canCreate={canCreate} canReadAll={canReadAll} />
      </Suspense>
    </Container>
  );
}

function RequestsListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
