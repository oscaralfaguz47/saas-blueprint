import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const patchDeptSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  code: z.string().max(40).trim().optional().nullable(),
  description: z.string().max(500).trim().optional().nullable(),
});

const archiveSchema = z.object({
  action: z.enum(["archive", "reactivate"]),
});

/**
 * PATCH /api/tenant/departments/[id]
 * Update or archive/reactivate a department.
 * Requires tenant.financial_config.manage.
 */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();
  const tenantId = tenant.id;

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { id } = paramsResult.data;

  const canManage = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.financial_config.manage",
  });
  if (!canManage) return ApiErrors.FORBIDDEN();

  const dept = await prisma.tenantDepartment.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, isActive: true },
  });
  if (!dept) return ApiErrors.NOT_FOUND("Department");

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");

  const archiveResult = archiveSchema.safeParse(rawBody);
  if (archiveResult.success) {
    const { action } = archiveResult.data;

    if (action === "archive") {
      const activeCostCenters = await prisma.tenantCostCenter.count({
        where: { departmentId: id, tenantId, isActive: true },
      });
      if (activeCostCenters > 0) {
        return ApiErrors.CONFLICT(
          `Cannot archive this department — it has ${activeCostCenters} active cost center(s). Archive or reassign them first.`
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.tenantDepartment.update({
        where: { id },
        data: {
          isActive: action === "reactivate",
          updatedByUserId: session.user.id,
        },
        select: { id: true, name: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId,
          action:
            action === "archive"
              ? "tenant.department.archived"
              : "tenant.department.reactivated",
          targetType: "TenantDepartment",
          targetId: id,
          metadata: { name: dept.name },
        },
      });

      return u;
    });

    return apiSuccess(updated);
  }

  const patchResult = patchDeptSchema.safeParse(rawBody);
  if (!patchResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", patchResult.error.flatten());
  }
  const patch = patchResult.data;

  if (patch.name !== undefined && patch.name.length > 0) {
    const duplicate = await prisma.tenantDepartment.findFirst({
      where: {
        tenantId,
        name: { equals: patch.name, mode: "insensitive" },
        id: { not: id },
      },
      select: { id: true },
    });
    if (duplicate) {
      return ApiErrors.CONFLICT("A department with this name already exists.");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.tenantDepartment.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        updatedByUserId: session.user.id,
      },
      select: { id: true, name: true, code: true, description: true, isActive: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.department.updated",
        targetType: "TenantDepartment",
        targetId: id,
        metadata: { updatedFields: Object.keys(patch) },
      },
    });

    return u;
  });

  return apiSuccess(updated);
});
