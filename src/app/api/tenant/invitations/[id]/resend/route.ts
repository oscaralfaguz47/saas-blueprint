import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { sendInvitationEmail } from "@/server/services/invitation-email";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";
import crypto from "crypto";

const paramsSchema = z.object({ id: z.string().cuid() });

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

/** POST resend: generate new token, update invite, send email (we don't store raw token so we issue a fresh link). */
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
      tenant: { select: { name: true } },
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

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  await prisma.tenantInvitation.update({
    where: { id: invite.id },
    data: { tokenHash, expiresAt },
  });

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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await sendInvitationEmail({
    tenantName: invite.tenant.name,
    invitedEmail: invite.email,
    rawToken,
    baseUrl,
  });

  return apiSuccess({ ok: true });
});
