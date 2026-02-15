import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

/** POST revoke: set revokedAt; only for ACTIVE invites. */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

  const { id: invitationId } = paramsSchema.parse(await context.params);

  const invite = await prisma.tenantInvitation.findFirst({
    where: { id: invitationId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!invite) return ApiErrors.NOT_FOUND("Invitation");

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: invite.tenantId, userId: session.user.id } },
    select: { id: true },
  });
  if (!membership) return ApiErrors.FORBIDDEN();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: invite.tenantId,
    permission: "tenant.users.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const now = new Date();
  const isActive = !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > now;
  if (!isActive) {
    return ApiErrors.VALIDATION_ERROR("Only active invitations can be revoked.");
  }

  await prisma.tenantInvitation.update({
    where: { id: invite.id },
    data: { revokedAt: now },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: invite.tenantId,
    action: "tenant.invite.revoked",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email: invite.email },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
