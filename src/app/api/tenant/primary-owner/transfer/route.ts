import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { z } from "zod";

const transferPrimaryOwnerSchema = z.object({
  newPrimaryOwnerUserId: z.string().cuid(),
});

/**
 * Transfer Primary Ownership to another Owner in the workspace.
 * A2: Only Primary Owner can call this. Target must have Owner role.
 * Re-authentication and notification to Owner-level users are TODO (future epic).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const body = await parseBody(req, transferPrimaryOwnerSchema);
  const { newPrimaryOwnerUserId } = body;

  const [actorMembership, targetMembership, primaryOwnerRole, ownerRole] =
    await Promise.all([
      prisma.tenantMembership.findUnique({
        where: {
          tenantId_userId: { tenantId: tenant.id, userId: session.user.id },
        },
        select: {
          id: true,
          roles: {
            select: { role: { select: { name: true, id: true } } },
          },
        },
      }),
      prisma.tenantMembership.findUnique({
        where: {
          tenantId_userId: { tenantId: tenant.id, userId: newPrimaryOwnerUserId },
        },
        select: {
          id: true,
          userId: true,
          roles: {
            select: { role: { select: { name: true, id: true } } },
          },
        },
      }),
      prisma.tenantRole.findUnique({
        where: {
          tenantId_name: { tenantId: tenant.id, name: "Primary Owner" },
        },
        select: { id: true },
      }),
      prisma.tenantRole.findUnique({
        where: { tenantId_name: { tenantId: tenant.id, name: "Owner" } },
        select: { id: true },
      }),
    ]);

  if (!actorMembership || !primaryOwnerRole || !ownerRole) {
    return ApiErrors.NOT_FOUND("Workspace or role not found");
  }

  const actorIsPrimaryOwner = actorMembership.roles.some(
    (r) => r.role.name === "Primary Owner"
  );
  if (!actorIsPrimaryOwner) {
    return ApiErrors.FORBIDDEN();
  }

  if (!targetMembership) {
    return ApiErrors.NOT_FOUND("Member");
  }

  const targetHasOwner = targetMembership.roles.some(
    (r) => r.role.name === "Owner" || r.role.name === "Primary Owner"
  );
  if (!targetHasOwner) {
    return ApiErrors.VALIDATION_ERROR(
      "New primary owner must have the Owner role.",
      { code: "TARGET_MUST_BE_OWNER" }
    );
  }

  if (targetMembership.userId === session.user.id) {
    return ApiErrors.VALIDATION_ERROR("You are already the primary owner.");
  }

  const currentPrimaryOwnerMembershipId = actorMembership.id;
  const newPrimaryOwnerMembershipId = targetMembership.id;

  await prisma.$transaction(async (tx) => {
    await tx.tenantUserRole.deleteMany({
      where: {
        membershipId: currentPrimaryOwnerMembershipId,
        roleId: primaryOwnerRole.id,
      },
    });
    await tx.tenantUserRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: newPrimaryOwnerMembershipId,
          roleId: primaryOwnerRole.id,
        },
      },
      create: {
        membershipId: newPrimaryOwnerMembershipId,
        roleId: primaryOwnerRole.id,
      },
      update: {},
    });
    await tx.tenantUserRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: currentPrimaryOwnerMembershipId,
          roleId: ownerRole.id,
        },
      },
      create: {
        membershipId: currentPrimaryOwnerMembershipId,
        roleId: ownerRole.id,
      },
      update: {},
    });
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "tenant.primary_owner.transferred",
    targetType: "TenantMembership",
    targetId: targetMembership.id,
    targetUserId: newPrimaryOwnerUserId,
    metadata: {
      previousPrimaryOwnerUserId: session.user.id,
      newPrimaryOwnerUserId,
    },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  // TODO: Re-authentication for sensitive action (per 00-EPIC-QUALITY-AND-PRACTICES §3.9).
  // TODO: Notify existing Owner-level users (per A2 Governance Operations).

  return apiSuccess({ ok: true });
});
