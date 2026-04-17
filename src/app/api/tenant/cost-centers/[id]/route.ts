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

const patchCCSchema = z.object({
  code: z.string().min(1).max(40).trim().optional(),
  name: z.string().min(1).max(120).trim().optional(),
  departmentId: z.string().cuid().optional(),
  description: z.string().max(500).trim().optional().nullable(),
});

const archiveSchema = z.object({
  action: z.enum(["archive", "reactivate"]),
});

/**
 * PATCH /api/tenant/cost-centers/[id]
 * Update or archive/reactivate a cost center.
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

  const cc = await prisma.tenantCostCenter.findFirst({
    where: { id, tenantId },
    select: { id: true, code: true, name: true, isActive: true, departmentId: true },
  });
  if (!cc) return ApiErrors.NOT_FOUND("Cost center");

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");

  const archiveResult = archiveSchema.safeParse(rawBody);
  if (archiveResult.success) {
    const { action } = archiveResult.data;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.tenantCostCenter.update({
        where: { id },
        data: {
          isActive: action === "reactivate",
          updatedByUserId: session.user.id,
        },
        select: { id: true, code: true, name: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.user.id,
          actorContext: "TENANT",
          tenantId,
          action:
            action === "archive"
              ? "tenant.cost_center.archived"
              : "tenant.cost_center.reactivated",
          targetType: "TenantCostCenter",
          targetId: id,
          metadata: { code: cc.code, name: cc.name },
        },
      });

      return u;
    });

    return apiSuccess(updated);
  }

  const patchResult = patchCCSchema.safeParse(rawBody);
  if (!patchResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", patchResult.error.flatten());
  }
  const patch = patchResult.data;

  if (patch.code !== undefined && patch.code.length > 0) {
    const duplicate = await prisma.tenantCostCenter.findFirst({
      where: {
        tenantId,
        code: { equals: patch.code, mode: "insensitive" },
        id: { not: id },
      },
      select: { id: true },
    });
    if (duplicate) {
      return ApiErrors.CONFLICT("A cost center with this code already exists.");
    }
  }

  if (patch.departmentId !== undefined) {
    const dept = await prisma.tenantDepartment.findFirst({
      where: { id: patch.departmentId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!dept) {
      return ApiErrors.VALIDATION_ERROR("Department not found or inactive.");
    }
  }

  const prevDeptId = cc.departmentId;
  const newDeptId = patch.departmentId;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.tenantCostCenter.update({
      where: { id },
      data: {
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        updatedByUserId: session.user.id,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action:
          newDeptId !== undefined && newDeptId !== prevDeptId
            ? "tenant.cost_center.reassigned"
            : "tenant.cost_center.updated",
        targetType: "TenantCostCenter",
        targetId: id,
        metadata: {
          updatedFields: Object.keys(patch),
          ...(newDeptId !== undefined && newDeptId !== prevDeptId
            ? { previousDepartmentId: prevDeptId, newDepartmentId: newDeptId }
            : {}),
        },
      },
    });

    return u;
  });

  return apiSuccess(updated);
});
