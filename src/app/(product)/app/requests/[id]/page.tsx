import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { getTenantPermissions } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestDetailClient } from "@/components/app/requests/request-detail-client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1) });

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const resolved = paramsSchema.safeParse(await params);
  if (!resolved.success) redirect("/app/requests");
  const { id } = resolved.data;

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) redirect("/app");

  const permissions = await getTenantPermissions({
    userId: session.user.id,
    tenantId: membership.tenant.id,
  });

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  return (
    <Container>
      <Suspense fallback={<RequestDetailSkeleton />}>
        <RequestDetailClient
          recordId={id}
          currentUserId={session.user.id}
          currentUserName={currentUser?.name ?? null}
          currentUserEmail={currentUser?.email ?? null}
          permissions={permissions}
        />
      </Suspense>
    </Container>
  );
}

function RequestDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
