import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import {
  getHighestRoleName,
  canManageTargetByRole,
  isOwnerLevel,
} from "@/server/security/authority";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberStatusSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ userId: z.string().cuid() });

/** Count ACTIVE memberships with Owner-level role (Primary Owner or Owner) in tenant. */
async function getOwnerLevelCount(tenantId: string): Promise<number> {
  const roles = await prisma.tenantRole.findMany({
    where: {
      tenantId,
      name: { in: ["Primary Owner", "Owner"] },
    },
    select: { id: true },
  });
  if (roles.length === 0) return 0;
  return prisma.tenantUserRole.count({
    where: {
      roleId: { in: roles.map((r) => r.id) },
      membership: { tenantId, status: "ACTIVE" },
    },
  });
}

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ userId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const body = await parseBody(req, updateMemberStatusSchema);
  const { userId: targetUserId } = paramsSchema.parse(await context.params);

  const [canManage, canDisable, actorMembership, targetMembership] = await Promise.all([
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
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
      select: { roles: { select: { role: { select: { name: true } } } } },
    }),
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: targetUserId } },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
  ]);

  const allowed = canManage || (body.status === "DISABLED" && canDisable);
  if (!allowed) return ApiErrors.FORBIDDEN();

  if (!actorMembership || !targetMembership) return ApiErrors.NOT_FOUND("Member");

  const actorRole = getHighestRoleName(
    actorMembership.roles.map((r) => r.role.name)
  ) ?? "Member";
  const targetRole = getHighestRoleName(
    targetMembership.roles.map((r) => r.role.name)
  ) ?? "Member";

  if (targetRole === "Primary Owner") {
    return ApiErrors.VALIDATION_ERROR(
      "Transfer primary ownership before disabling the primary owner.",
      { code: "USE_TRANSFER_PRIMARY_OWNERSHIP" }
    );
  }

  if (!canManageTargetByRole(actorRole, targetRole)) {
    return ApiErrors.FORBIDDEN();
  }

  if (body.status === "DISABLED" && isOwnerLevel(targetRole)) {
    const actorIsPrimaryOwner = actorRole === "Primary Owner";
    if (!actorIsPrimaryOwner) {
      const ownerLevelCount = await getOwnerLevelCount(tenant.id);
      if (ownerLevelCount <= 1) {
        return ApiErrors.VALIDATION_ERROR("Cannot disable the last owner-level user.");
      }
    }
  }

  await prisma.tenantMembership.update({
    where: { id: targetMembership.id },
    data: { status: body.status },
  });

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
