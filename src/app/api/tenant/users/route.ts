import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.users.read",
  });

  if (!allowed) return ApiErrors.FORBIDDEN();

  const rows = await prisma.tenantMembership.findMany({
    where: { tenantId: tenant.id },
    select: {
      status: true,
      joinedAt: true,
      lastSeenAt: true,
      isDefaultTenant: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          isPlatformBlocked: true,
        },
      },
      roles: {
        select: {
          role: { select: { name: true } },
        },
      },
    },
    orderBy: [{ joinedAt: "desc" }],
  });

  // Audit (read access) – útil para debugging y compliance.
  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "tenant.users.read",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { count: rows.length },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  return apiSuccess({
    tenant,
    users: rows.map((m) => ({
      membership: {
        status: m.status,
        joinedAt: m.joinedAt,
        lastSeenAt: m.lastSeenAt,
        isDefaultTenant: m.isDefaultTenant,
      },
      user: m.user,
      roles: m.roles.map((r) => r.role.name),
    })),
  });
});

function getIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}
