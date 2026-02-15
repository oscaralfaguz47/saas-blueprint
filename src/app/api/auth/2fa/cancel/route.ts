import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return ip;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function getSessionCookieName(): string {
  const isSecure =
    process.env.NODE_ENV === "production" &&
    (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  return isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

/**
 * POST /api/auth/2fa/cancel
 * User-initiated sign out from /auth/2fa (PENDING_MFA). Revokes pending session,
 * clears session cookie, returns { ok: true }. Idempotent; no step-up required.
 */
export const POST = withErrorHandler(async (req: Request) => {
  if (!checkRateLimit(getClientKey(req))) {
    return ApiErrors.RATE_LIMITED("Too many requests. Try again later.");
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
