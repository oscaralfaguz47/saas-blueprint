import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { revokeVendorInvitationBodySchema } from "@/lib/validations/admin";
import {
  checkAdminMutationLimit,
  checkAdminWorkspacesListLimit,
} from "@/server/security/admin-rate-limit";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { isBootstrapAllowlistedEmail } from "@/server/services/platform-bootstrap";
import { writeAuditLog } from "@/server/services/audit";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspacesListLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const now = new Date();
  const invitations = await prisma.vendorInvitation.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      email: true,
      roleName: true,
      createdAt: true,
      expiresAt: true,
      invitedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return apiSuccess({ invitations });
});

export const DELETE = withErrorHandler(async (req: Request) => {
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

  let body;
  try {
    body = revokeVendorInvitationBodySchema.parse(await req.json());
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const now = new Date();
  const invitation = await prisma.vendorInvitation.findFirst({
    where: {
      id: body.invitationId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, email: true, roleName: true },
  });

  if (!invitation) return ApiErrors.NOT_FOUND("Invitation");

  const actorIsSuperAdmin = isBootstrapAllowlistedEmail(actor.email);
  if (!actorIsSuperAdmin && invitation.roleName === "PlatformAdmin") {
    return ApiErrors.FORBIDDEN();
  }

  await prisma.vendorInvitation.update({
    where: { id: invitation.id },
    data: { revokedAt: now },
  });

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await writeAuditLog({
    actorUserId: actor.id,
    actorContext: "VENDOR",
    action: "admin.vendor_user.invitation_revoked",
    targetType: "VendorInvitation",
    targetId: invitation.id,
    metadata: { email: invitation.email, roleName: invitation.roleName },
    ipAddress,
    userAgent,
  });

  return apiSuccess({ ok: true });
});
