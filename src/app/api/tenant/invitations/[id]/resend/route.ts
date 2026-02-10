import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

/** POST resend: audit only. Same-token resend would require storing token (e.g. queue); TODO when email provider is added. */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

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
    return ApiErrors.VALIDATION_ERROR("Only active invitations can be resent.");
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: invite.tenantId,
    action: "tenant.invite.resent",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email: invite.email },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ ok: true });
});
