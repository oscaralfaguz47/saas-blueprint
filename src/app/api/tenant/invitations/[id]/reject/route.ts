import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getOnboardingCounts } from "@/server/services/onboarding";
import { writeAuditLog } from "@/server/services/audit";
import { sendInvitationDeclinedNotificationToInviter } from "@/server/services/invitation-email";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}

/** POST /api/tenant/invitations/[id]/reject — A5: in-app reject by invitation id (authenticated) */
export const POST = withErrorHandler(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

  const { id: invitationId } = await params;
  if (!invitationId?.trim()) return ApiErrors.VALIDATION_ERROR("Invitation id is required");

  const invite = await prisma.tenantInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      status: true,
      revokedAt: true,
      expiresAt: true,
      tenant: { select: { name: true } },
      invitedByUser: { select: { email: true } },
    },
  });

  if (!invite) return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();
  if (invite.status !== "PENDING") return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();
  if (invite.revokedAt) return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();
  const now = new Date();
  if (invite.expiresAt <= now) return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();

  const userEmail = (session.user.email ?? "").toLowerCase();
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    return ApiErrors.VALIDATION_ERROR(
      "This invitation was issued for a different email address",
      { expectedEmail: invite.email, currentEmail: userEmail || null, code: "INVITE_EMAIL_MISMATCH" }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  await prisma.tenantInvitation.update({
    where: { id: invite.id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectedByUserId: session.user.id,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: invite.tenantId,
    action: "tenant.invite.rejected",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { invitationId: invite.id, invitedEmail: invite.email, result: "rejected" },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  sendInvitationDeclinedNotificationToInviter({
    inviterEmail: invite.invitedByUser?.email ?? null,
    workspaceName: invite.tenant.name,
    declinedEmail: invite.email,
  }).catch((err) => console.error("[reject] Declined notification email failed:", err));

  const { activeMembershipCount, pendingInvitationsCount } = await getOnboardingCounts(session.user.id);
  let redirectTo = "/app/requests";
  if (activeMembershipCount === 0) {
    redirectTo = pendingInvitationsCount > 0 ? "/setup/choose" : "/setup/workspace";
  }

  return apiSuccess({ ok: true, redirect: redirectTo });
});
