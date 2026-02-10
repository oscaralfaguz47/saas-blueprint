import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { apiSuccess, withErrorHandler } from "@/lib/api-response";
import crypto from "crypto";

const PENDING_INVITE_COOKIE = "pending_invite_token";
const PENDING_INVITE_MAX_AGE = 60 * 60 * 24; // 24h

function clearPendingInviteCookie(res: NextResponse) {
  res.cookies.set(PENDING_INVITE_COOKIE, "", { maxAge: 0, path: "/" });
}

/** GET /api/tenant/invitations/validate?token=RAW_TOKEN — public, no auth. Returns minimal safe payload for /invite page. */
export const GET = withErrorHandler(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token || token.length < 20) {
    const res = apiSuccess({ valid: false, state: "invalid" });
    clearPendingInviteCookie(res);
    return res;
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
    const res = apiSuccess({ valid: false, state: "invalid" });
    clearPendingInviteCookie(res);
    return res;
  }

  const now = new Date();
  if (invite.acceptedAt) {
    const res = apiSuccess({ valid: false, state: "accepted" });
    clearPendingInviteCookie(res);
    return res;
  }
  if (invite.revokedAt) {
    const res = apiSuccess({ valid: false, state: "revoked" });
    clearPendingInviteCookie(res);
    return res;
  }
  if (invite.expiresAt <= now) {
    const res = apiSuccess({ valid: false, state: "expired" });
    clearPendingInviteCookie(res);
    return res;
  }

  const res = apiSuccess({
    valid: true,
    state: "valid",
    workspaceName: invite.tenant.name,
    invitedEmail: invite.email,
  });
  res.cookies.set(PENDING_INVITE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PENDING_INVITE_MAX_AGE,
    path: "/",
  });
  return res;
});
