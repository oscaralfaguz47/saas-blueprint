import { prisma } from "@/server/db";
import { apiSuccess, withErrorHandler } from "@/lib/api-response";
import crypto from "crypto";

/** GET /api/tenant/invitations/validate?token=RAW_TOKEN — public, no auth. Returns minimal safe payload for /invite page. */
export const GET = withErrorHandler(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token || token.length < 20) {
    return apiSuccess({
      valid: false,
      state: "invalid",
    });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const invite = await prisma.tenantInvitation.findUnique({
    where: { tokenHash },
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

  if (!invite) {
    return apiSuccess({ valid: false, state: "invalid" });
  }

  const now = new Date();
  if (invite.acceptedAt) {
    return apiSuccess({ valid: false, state: "accepted" });
  }
  if (invite.revokedAt) {
    return apiSuccess({ valid: false, state: "revoked" });
  }
  if (invite.expiresAt <= now) {
    return apiSuccess({ valid: false, state: "expired" });
  }

  return apiSuccess({
    valid: true,
    state: "valid",
    workspaceName: invite.tenant.name,
    invitedEmail: invite.email,
  });
});
