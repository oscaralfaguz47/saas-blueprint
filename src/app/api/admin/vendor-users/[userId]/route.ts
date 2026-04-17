import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { checkAdminMutationLimit } from "@/server/security/admin-rate-limit";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { isBootstrapAllowlistedEmail } from "@/server/services/platform-bootstrap";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ userId: z.string().cuid() });

const patchVendorUserRoleBodySchema = z.object({
  roleName: z.enum(["PlatformAdmin", "SupportAdmin", "BillingOps", "ReadOnlySupport"]),
});

export const DELETE = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ userId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminMutationLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many actions. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!actor) return ApiErrors.UNAUTHENTICATED();

  const actorPlatformAdminRole = await prisma.vendorUserRole.findFirst({
    where: {
      userId: actor.id,
      role: { name: "PlatformAdmin" },
    },
    select: { userId: true },
  });
  if (!actorPlatformAdminRole) return ApiErrors.FORBIDDEN();

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid user id", parsed.error.flatten());
  }
  const { userId } = parsed.data;
  if (userId === session.user.id) {
    return apiError("CANNOT_REMOVE_SELF", 400, "You cannot remove your own vendor access.");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!targetUser) return ApiErrors.NOT_FOUND("User");

  if (isBootstrapAllowlistedEmail(targetUser.email)) return ApiErrors.FORBIDDEN();

  const actorIsSuperAdmin = isBootstrapAllowlistedEmail(actor.email);
  const targetRoles = await prisma.vendorUserRole.findMany({
    where: { userId },
    select: { role: { select: { name: true } } },
  });

  if (targetRoles.length === 0) {
    return ApiErrors.NOT_FOUND("Vendor user");
  }

  const targetHasPlatformAdmin = targetRoles.some(
    (targetRole) => targetRole.role.name === "PlatformAdmin"
  );
  if (!actorIsSuperAdmin && targetHasPlatformAdmin) {
    return ApiErrors.FORBIDDEN();
  }

  await prisma.vendorUserRole.deleteMany({ where: { userId } });

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await writeAuditLog({
    actorUserId: actor.id,
    actorContext: "VENDOR",
    action: "admin.vendor_user.removed",
    targetType: "User",
    targetId: userId,
    ipAddress,
    userAgent,
  });

  return apiSuccess({ ok: true });
});

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ userId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminMutationLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many actions. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!actor) return ApiErrors.UNAUTHENTICATED();

  const actorPlatformAdminRole = await prisma.vendorUserRole.findFirst({
    where: {
      userId: actor.id,
      role: { name: "PlatformAdmin" },
    },
    select: { userId: true },
  });
  if (!actorPlatformAdminRole) return ApiErrors.FORBIDDEN();

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid user id", parsedParams.error.flatten());
  }
  const { userId } = parsedParams.data;
  if (userId === session.user.id) {
    return apiError("CANNOT_CHANGE_SELF", 400, "You cannot change your own vendor role.");
  }

  let body: z.infer<typeof patchVendorUserRoleBodySchema>;
  try {
    body = patchVendorUserRoleBodySchema.parse(await req.json());
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!targetUser) return ApiErrors.NOT_FOUND("User");

  if (isBootstrapAllowlistedEmail(targetUser.email)) return ApiErrors.FORBIDDEN();

  const actorIsSuperAdmin = isBootstrapAllowlistedEmail(actor.email);
  if (!actorIsSuperAdmin && body.roleName === "PlatformAdmin") {
    return ApiErrors.FORBIDDEN();
  }

  const targetHasPlatformAdmin = await prisma.vendorUserRole.findFirst({
    where: {
      userId,
      role: { name: "PlatformAdmin" },
    },
    select: { userId: true },
  });
  if (!actorIsSuperAdmin && targetHasPlatformAdmin) {
    return ApiErrors.FORBIDDEN();
  }

  const newRole = await prisma.vendorRole.findUnique({
    where: { name: body.roleName },
    select: { id: true, name: true },
  });
  if (!newRole) return ApiErrors.NOT_FOUND("Vendor role");

  await prisma.$transaction([
    prisma.vendorUserRole.deleteMany({ where: { userId } }),
    prisma.vendorUserRole.create({
      data: {
        userId,
        roleId: newRole.id,
      },
    }),
  ]);

  await writeAuditLog({
    actorUserId: actor.id,
    actorContext: "VENDOR",
    action: "admin.vendor_user.role_changed",
    targetType: "User",
    targetId: userId,
    metadata: { roleName: body.roleName },
  });

  return apiSuccess({ ok: true });
});
