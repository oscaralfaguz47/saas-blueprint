import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";
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

/** POST /api/tenant/invitations/reject — A5: reject invite, optionally create DRAFT workspace */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await parseBody(req, acceptInvitationSchema);
  const tokenHash = sha256(body.token);

  const invite = await prisma.tenantInvitation.findFirst({
    where: {
      tokenHash,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, tenantId: true, email: true },
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

  const draftResult = await ensureDraftWorkspaceForUser({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  const redirectTo =
    draftResult.tenant.status === "ACTIVE" ? "/app/requests" : "/setup/workspace";

  const res = apiSuccess({
    ok: true,
    redirect: redirectTo,
  });
  res.cookies.set("pending_invite_token", "", { maxAge: 0, path: "/" });
  return res;
});
