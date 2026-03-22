import { getServerSession } from "next-auth";
import { env } from "@/lib/env";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";

function getSessionCookieName(): string {
  const isSecure =
    process.env.NODE_ENV === "production" &&
    (env.NEXTAUTH_URL ?? "").startsWith("https://");
  return isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

/**
 * POST /api/auth/2fa/cancel
 * User-initiated sign out from /auth/2fa (PENDING_MFA). Revokes pending session,
 * clears session cookie, returns { ok: true }. Idempotent; no step-up required.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit(`2fa:cancel:${ip}`, 30, 60 * 1000);
  if (!rateLimitResult.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests. Try again later.", {
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });
  }

  const session = await getServerSession(authOptions);
  const now = new Date();

  if (session?.user?.id && session.user.sessionToken) {
    await prisma.session.updateMany({
      where: { sessionToken: session.user.sessionToken },
      data: { revokedAt: now, logoutReason: "user_cancelled_mfa" },
    });

    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId: null,
      action: "account.sessions.mfa_cancelled",
      targetType: "User",
      targetId: session.user.id,
      targetUserId: session.user.id,
      metadata: { reason: "user_cancelled_mfa" },
    });
  }

  const res = apiSuccess({ ok: true });
  const cookieName = getSessionCookieName();
  res.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
});
