import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/services/audit";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { z } from "zod";

const STEP_UP_WINDOW_SECONDS = 10 * 60; // 10 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3;

const transferPrimaryOwnerSchema = z.object({
  newPrimaryOwnerUserId: z.string().cuid(),
  workspaceSlugConfirm: z.string().max(80).optional(),
});

const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

function checkTransferRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);
  if (!entry) {
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/**
 * A7: Transfer Primary Ownership. Only Primary Owner can call.
 * Requires step-up (recent auth ≤10 min). Target must be ACTIVE, Owner or Admin.
 * Atomic transaction with re-validation and invariant checks.
 * TODO: Explicit re-authentication challenge (future epic).
 * TODO: Governance notification to Owner-level users (future epic).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const iat = session.user.iat ?? 0;
  if (iat <= 0 || Date.now() / 1000 - iat > STEP_UP_WINDOW_SECONDS) {
    return apiError(
      "FORBIDDEN",
      403,
      "Recent authentication required to transfer ownership.",
      { code: "NEED_STEP_UP" }
    );
  }

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  if (!checkTransferRateLimit(tenant.id)) {
    return ApiErrors.RATE_LIMITED(
      "Too many transfer attempts. Try again later."
    );
  }

  let body: z.infer<typeof transferPrimaryOwnerSchema>;
  try {
    body = await parseBody(req, transferPrimaryOwnerSchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }
  const { newPrimaryOwnerUserId, workspaceSlugConfirm } = body;

  if (workspaceSlugConfirm !== undefined && workspaceSlugConfirm !== tenant.slug) {
    return ApiErrors.VALIDATION_ERROR("Workspace slug confirmation does not match.");
  }

  const [actorMembership, targetMembership, primaryOwnerRole, ownerRole] =
    await Promise.all([
      prisma.tenantMembership.findUnique({
        where: {
          tenantId_userId: { tenantId: tenant.id, userId: session.user.id },
        },
        select: {
          id: true,
          userId: true,
          status: true,
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
          status: true,
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

  if (targetMembership.status !== "ACTIVE") {
    return ApiErrors.VALIDATION_ERROR("Target user is no longer active.", {
      code: "TARGET_NOT_ACTIVE",
    });
  }

  if (targetMembership.userId === session.user.id) {
    return ApiErrors.VALIDATION_ERROR("You are already the primary owner.");
  }

  const targetRoleNames = targetMembership.roles.map((r) => r.role.name);
  const targetIsEligible =
    targetRoleNames.includes("Owner") || targetRoleNames.includes("Admin");
  if (!targetIsEligible) {
    return ApiErrors.VALIDATION_ERROR(
      "New primary owner must have the Owner or Admin role.",
      { code: "TARGET_MUST_BE_OWNER_OR_ADMIN" }
    );
  }

  const targetAlreadyPrimaryOwner = targetRoleNames.includes("Primary Owner");
  if (targetAlreadyPrimaryOwner) {
    return apiSuccess({ ok: true });
  }

  const currentPrimaryOwnerMembershipId = actorMembership.id;
  const newPrimaryOwnerMembershipId = targetMembership.id;

  try {
    await prisma.$transaction(
      async (tx) => {
        const [lockedActor, lockedTarget, primaryRole, ownerRoleTx] =
          await Promise.all([
            tx.tenantMembership.findUnique({
              where: { id: currentPrimaryOwnerMembershipId },
              select: {
                id: true,
                userId: true,
                status: true,
                roles: {
                  select: { role: { select: { name: true, id: true } } },
                },
              },
            }),
            tx.tenantMembership.findUnique({
              where: { id: newPrimaryOwnerMembershipId },
              select: {
                id: true,
                userId: true,
                status: true,
                roles: {
                  select: { role: { select: { name: true, id: true } } },
                },
              },
            }),
            tx.tenantRole.findUnique({
              where: {
                tenantId_name: { tenantId: tenant.id, name: "Primary Owner" },
              },
              select: { id: true },
            }),
            tx.tenantRole.findUnique({
              where: {
                tenantId_name: { tenantId: tenant.id, name: "Owner" },
              },
              select: { id: true },
            }),
          ]);

        if (!lockedActor || !lockedTarget || !primaryRole || !ownerRoleTx) {
          throw new Error("TRANSFER_VALIDATION");
        }

        const stillPrimaryOwner = lockedActor.roles.some(
          (r) => r.role.name === "Primary Owner"
        );
        if (!stillPrimaryOwner) {
          throw new Error("PRIMARY_OWNER_CHANGED");
        }

        if (lockedTarget.status !== "ACTIVE") {
          throw new Error("TARGET_NOT_ACTIVE");
        }

        await tx.tenantUserRole.deleteMany({
          where: {
            membershipId: currentPrimaryOwnerMembershipId,
            roleId: primaryRole.id,
          },
        });
        await tx.tenantUserRole.upsert({
          where: {
            membershipId_roleId: {
              membershipId: newPrimaryOwnerMembershipId,
              roleId: primaryRole.id,
            },
          },
          create: {
            membershipId: newPrimaryOwnerMembershipId,
            roleId: primaryRole.id,
          },
          update: {},
        });
        await tx.tenantUserRole.upsert({
          where: {
            membershipId_roleId: {
              membershipId: currentPrimaryOwnerMembershipId,
              roleId: ownerRoleTx.id,
            },
          },
          create: {
            membershipId: currentPrimaryOwnerMembershipId,
            roleId: ownerRoleTx.id,
          },
          update: {},
        });

        const primaryOwnerCount = await tx.tenantUserRole.count({
          where: {
            roleId: primaryRole.id,
            membership: { tenantId: tenant.id, status: "ACTIVE" },
          },
        });
        if (primaryOwnerCount !== 1) {
          throw new Error("INVARIANT_VIOLATION");
        }

        const ownerRoleIds = [primaryRole.id, ownerRoleTx.id];
        const ownerLevelCount = await tx.tenantUserRole.count({
          where: {
            roleId: { in: ownerRoleIds },
            membership: { tenantId: tenant.id, status: "ACTIVE" },
          },
        });
        if (ownerLevelCount < 1) {
          throw new Error("INVARIANT_VIOLATION");
        }

        await writeAuditLog({
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.membership.primary_owner_transferred",
          targetType: "TenantMembership",
          targetId: lockedTarget.id,
          targetUserId: newPrimaryOwnerUserId,
          metadata: {
            actorId: session.user.id,
            oldPrimaryOwnerId: session.user.id,
            newPrimaryOwnerId: newPrimaryOwnerUserId,
            tenantId: tenant.id,
            beforeRole: "Primary Owner",
            afterRoleActor: "Owner",
            afterRoleTarget: "Primary Owner",
            timestamp: new Date().toISOString(),
          },
          ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PRIMARY_OWNER_CHANGED") {
        return ApiErrors.VALIDATION_ERROR(
          "Primary Owner has changed during this operation.",
          { code: "PRIMARY_OWNER_CHANGED" }
        );
      }
      if (err.message === "TARGET_NOT_ACTIVE") {
        return ApiErrors.VALIDATION_ERROR("Target user is no longer active.", {
          code: "TARGET_NOT_ACTIVE",
        });
      }
      if (
        err.message === "INVARIANT_VIOLATION" ||
        err.message === "TRANSFER_VALIDATION"
      ) {
        return ApiErrors.VALIDATION_ERROR("Transfer could not be completed.", {
          code: "TRANSFER_FAILED",
        });
      }
    }
    throw err;
  }

  return apiSuccess({ ok: true });
});
