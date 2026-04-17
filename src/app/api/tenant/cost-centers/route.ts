import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const createCCSchema = z.object({
  code: z.string().min(1, "Code is required").max(40).trim(),
  name: z.string().min(1, "Name is required").max(120).trim(),
  departmentId: z.string().cuid("Invalid department"),
  description: z
    .string()
    .max(500)
    .trim()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : undefined)),
});

/**
 * GET /api/tenant/cost-centers
 * List cost centers for current tenant.
 * Query: ?activeOnly=true (default true), ?departmentId=xxx
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();
  const tenantId = tenant.id;

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("activeOnly") !== "false";
  const departmentIdParam = url.searchParams.get("departmentId");
  const departmentId =
    departmentIdParam && z.string().cuid().safeParse(departmentIdParam).success
      ? departmentIdParam
      : undefined;

  const costCenters = await prisma.tenantCostCenter.findMany({
    where: {
      tenantId,
      ...(activeOnly ? { isActive: true } : {}),
      ...(departmentId ? { departmentId } : {}),
    },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isActive: true,
      departmentId: true,
      department: { select: { id: true, name: true, code: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return apiSuccess({ costCenters });
});

/**
 * POST /api/tenant/cost-centers
 * Create a cost center. Requires tenant.financial_config.manage.
 */
export const POST = withErrorHandler(async (req: Request) => {
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

  const canManage = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.financial_config.manage",
  });
  if (!canManage) return ApiErrors.FORBIDDEN();

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const result = createCCSchema.safeParse(rawBody);
  if (!result.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", result.error.flatten());
  }
  const { code, name, departmentId, description } = result.data;

  const dept = await prisma.tenantDepartment.findFirst({
    where: { id: departmentId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!dept) {
    return ApiErrors.VALIDATION_ERROR("Department not found or inactive.");
  }

  const existing = await prisma.tenantCostCenter.findFirst({
    where: { tenantId, code: { equals: code, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return ApiErrors.CONFLICT("A cost center with this code already exists.");
  }

  const costCenter = await prisma.$transaction(async (tx) => {
    const cc = await tx.tenantCostCenter.create({
      data: {
        tenantId,
        departmentId,
        code,
        name,
        description: description ?? null,
        isActive: true,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        departmentId: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.cost_center.created",
        targetType: "TenantCostCenter",
        targetId: cc.id,
        metadata: { code: cc.code, name: cc.name, departmentId },
      },
    });

    return cc;
  });

  return apiSuccess(costCenter, 201);
});
