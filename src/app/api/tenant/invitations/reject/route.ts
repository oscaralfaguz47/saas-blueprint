import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getOnboardingCounts } from "@/server/services/onboarding";
import { writeAuditLog } from "@/server/services/audit";
import { sendInvitationDeclinedNotificationToInviter } from "@/server/services/invitation-email";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, acceptInvitationSchema } from "@/lib/validations";
import crypto from "crypto";

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}

/** POST /api/tenant/invitations/reject — A5: reject invite by token (link); no auto-create DRAFT */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

  const body = await parseBody(req, acceptInvitationSchema);
  const tokenHash = sha256(body.token);

  const invite = await prisma.tenantInvitation.findFirst({
    where: {
      tokenHash,
      status: "PENDING",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      tenant: { select: { name: true } },
      invitedByUser: { select: { email: true } },
    },
  });

  if (!invite) {
    return ApiErrors.NOT_FOUND("Invitation not found or expired");
  }

  const userEmail = (session.user.email ?? "").toLowerCase();
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    return ApiErrors.VALIDATION_ERROR(
      "This invitation was issued for a different email address",
      {
        expectedEmail: invite.email,
        currentEmail: userEmail || null,
      }
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
    metadata: {
      invitationId: invite.id,
      invitedEmail: invite.email,
      result: "rejected",
    },
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

  const res = apiSuccess({ ok: true, redirect: redirectTo });
  res.cookies.set("pending_invite_token", "", { maxAge: 0, path: "/" });
  return res;
});
