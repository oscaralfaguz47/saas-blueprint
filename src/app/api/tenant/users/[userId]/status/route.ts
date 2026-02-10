import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberStatusSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ userId: z.string().cuid() });

async function getOwnerCount(tenantId: string): Promise<number> {
  const ownerRole = await prisma.tenantRole.findUnique({
    where: { tenantId_name: { tenantId, name: "Owner" } },
    select: { id: true },
  });
  if (!ownerRole) return 0;
  return prisma.tenantUserRole.count({
    where: { roleId: ownerRole.id, membership: { tenantId, status: "ACTIVE" } },
  });
}

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ userId: string }> }
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const body = await parseBody(req, updateMemberStatusSchema);
  const [canManage, canDisable] = await Promise.all([
    hasTenantPermission({
      userId: session.user.id,
      tenantId: tenant.id,
      permission: "tenant.users.manage",
    }),
    hasTenantPermission({
      userId: session.user.id,
      tenantId: tenant.id,
      permission: "tenant.users.disable",
    }),
  ]);
  const allowed = canManage || (body.status === "DISABLED" && canDisable);
  if (!allowed) return ApiErrors.FORBIDDEN();

  const { userId: targetUserId } = paramsSchema.parse(await context.params);

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: targetUserId } },
    select: {
      id: true,
      status: true,
      roles: {
        select: { role: { select: { name: true } } },
      },
    },
  });
  if (!targetMembership) return ApiErrors.NOT_FOUND("Member");

  const isOwner = targetMembership.roles.some((r) => r.role.name === "Owner");
  if (body.status === "DISABLED" && isOwner) {
    const ownerCount = await getOwnerCount(tenant.id);
    if (ownerCount <= 1) {
      return ApiErrors.VALIDATION_ERROR("Cannot disable the last owner.");
    }
  }

  await prisma.tenantMembership.update({
    where: { id: targetMembership.id },
    data: { status: body.status },
  });

  // When re-enabling, ensure at most one ACTIVE membership has isDefaultTenant true (fixes duplicate-default bug)
  if (body.status === "ACTIVE") {
    const activeWithDefault = await prisma.tenantMembership.findMany({
      where: {
        userId: targetUserId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
        isDefaultTenant: true,
      },
      select: { id: true },
      orderBy: { joinedAt: "desc" },
    });
    if (activeWithDefault.length > 1) {
      const keepId = activeWithDefault[0]!.id;
      await prisma.tenantMembership.updateMany({
        where: { userId: targetUserId, status: "ACTIVE", id: { not: keepId } },
        data: { isDefaultTenant: false },
      });
    }
  }

  const action = body.status === "ACTIVE" ? "tenant.user.enabled" : "tenant.user.disabled";
  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action,
    targetType: "TenantMembership",
    targetId: targetMembership.id,
    targetUserId: targetUserId,
    metadata: { previousStatus: targetMembership.status, newStatus: body.status },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
