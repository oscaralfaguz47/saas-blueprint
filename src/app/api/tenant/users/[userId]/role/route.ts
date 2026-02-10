import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberRoleSchema } from "@/lib/validations";
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

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.roles.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const { userId: targetUserId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, updateMemberRoleSchema);

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: targetUserId } },
    select: {
      id: true,
      roles: {
        select: { roleId: true, role: { select: { name: true } } },
      },
    },
  });
  if (!targetMembership) return ApiErrors.NOT_FOUND("Member");

  const currentRoleName = targetMembership.roles.map((r) => r.role.name)[0] ?? "Member";
  if (currentRoleName === "Owner" && body.role !== "Owner") {
    const ownerCount = await getOwnerCount(tenant.id);
    if (ownerCount <= 1) {
      return ApiErrors.VALIDATION_ERROR("Cannot remove the last owner.");
    }
  }

  const roles = await prisma.tenantRole.findMany({
    where: { tenantId: tenant.id, name: { in: ["Owner", "Admin", "Finance", "Member"] } },
    select: { id: true, name: true },
  });
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
    metadata: { previousRole: currentRoleName, newRole: body.role },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
