import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import {
  getHighestRoleName,
  getRoleRank,
  canManageTargetByRole,
  onlyPrimaryOwnerCanChangeOwnerLevel,
  isOwnerLevel,
} from "@/server/security/authority";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberRoleSchema } from "@/lib/validations";
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
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.roles.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const { userId: targetUserId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, updateMemberRoleSchema);

  const [actorMembership, targetMembership, roles] = await Promise.all([
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
      select: {
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: targetUserId } },
      select: {
        id: true,
        roles: { select: { roleId: true, role: { select: { name: true } } } },
      },
    }),
    prisma.tenantRole.findMany({
      where: { tenantId: tenant.id, name: { in: ["Owner", "Admin", "Finance", "Member"] } },
      select: { id: true, name: true },
    }),
  ]);

  if (!actorMembership || !targetMembership) return ApiErrors.NOT_FOUND("Member");

  const actorRoleNames = actorMembership.roles.map((r) => r.role.name);
  const targetRoleNames = targetMembership.roles.map((r) => r.role.name);
  const actorRole = getHighestRoleName(actorRoleNames) ?? "Member";
  const currentTargetRole = getHighestRoleName(targetRoleNames) ?? "Member";

  // A7: Generic role endpoint must not assign or demote Primary Owner; use dedicated transfer endpoint.
  if (currentTargetRole === "Primary Owner") {
    return ApiErrors.VALIDATION_ERROR(
      "Use transfer primary ownership to change the primary owner.",
      { code: "USE_TRANSFER_PRIMARY_OWNERSHIP" }
    );
  }

  const isOwnerLevelChange =
    body.role === "Owner" || isOwnerLevel(currentTargetRole);
  if (isOwnerLevelChange && !onlyPrimaryOwnerCanChangeOwnerLevel(actorRole)) {
    return ApiErrors.FORBIDDEN();
  }

  if (!canManageTargetByRole(actorRole, currentTargetRole)) {
    return ApiErrors.FORBIDDEN();
  }

  if (getRoleRank(actorRole) <= getRoleRank(body.role)) {
    return ApiErrors.FORBIDDEN();
  }

  // Primary Owner can always change others (including downgrading the last Owner); they remain owner-level.
  const actorIsPrimaryOwner = actorRole === "Primary Owner";
  if (!actorIsPrimaryOwner) {
    const ownerLevelCount = await getOwnerLevelCount(tenant.id);
    const targetHadOwnerLevel = isOwnerLevel(currentTargetRole);
    const willAddOwner = body.role === "Owner";
    const ownerLevelAfter =
      ownerLevelCount - (targetHadOwnerLevel ? 1 : 0) + (willAddOwner ? 1 : 0);
    if (ownerLevelAfter < 1) {
      return ApiErrors.VALIDATION_ERROR("At least one owner-level user must remain.");
    }
  }

  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
  const newRoleId = roleIdByName.get(body.role);
  if (!newRoleId) return ApiErrors.VALIDATION_ERROR("Invalid role.");

  await prisma.$transaction(async (tx) => {
    await tx.tenantUserRole.deleteMany({
      where: { membershipId: targetMembership.id },
    });
    await tx.tenantUserRole.create({
      data: { membershipId: targetMembership.id, roleId: newRoleId },
    });
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "tenant.role.changed",
    targetType: "TenantMembership",
    targetId: targetMembership.id,
    targetUserId: targetUserId,
    metadata: { previousRole: currentTargetRole, newRole: body.role },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
