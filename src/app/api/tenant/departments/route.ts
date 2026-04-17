import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const createDeptSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).trim(),
  code: z
    .string()
    .max(40)
    .trim()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : undefined)),
  description: z
    .string()
    .max(500)
    .trim()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : undefined)),
});

/**
 * GET /api/tenant/departments
 * List departments for current tenant.
 * Accessible by anyone with access to the tenant (for request form selectors).
 * Query: ?activeOnly=true (default true)
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

  const departments = await prisma.tenantDepartment.findMany({
    where: {
      tenantId,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          costCenters: { where: { isActive: true } },
        },
      },
    },
  });

  return apiSuccess({ departments });
});

/**
 * POST /api/tenant/departments
 * Create a department. Requires tenant.financial_config.manage.
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
  const result = createDeptSchema.safeParse(rawBody);
  if (!result.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", result.error.flatten());
  }
  const { name, code, description } = result.data;

  const existing = await prisma.tenantDepartment.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return ApiErrors.CONFLICT("A department with this name already exists.");
  }

  const department = await prisma.$transaction(async (tx) => {
    const dept = await tx.tenantDepartment.create({
      data: {
        tenantId,
        name,
        code: code ?? null,
        description: description ?? null,
        isActive: true,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
      },
      select: { id: true, name: true, code: true, isActive: true, createdAt: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.department.created",
        targetType: "TenantDepartment",
        targetId: dept.id,
        metadata: { name: dept.name, code: dept.code },
      },
    });

    return dept;
  });

  return apiSuccess(department, 201);
});
