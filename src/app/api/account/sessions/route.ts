import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseUserAgent } from "@/server/lib/device-parser";

/**
 * GET /api/account/sessions
 * Returns all active (non-revoked, non-expired) sessions for the current user.
 * Marks the current session with isCurrent: true.
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      revokedAt: null,
      expires: { gt: now },
    },
    select: {
      id: true,
      sessionToken: true,
      createdAt: true,
      lastActivityAt: true,
      ipFirstSeen: true,
      lastIp: true,
      userAgent: true,
      authLevel: true,
      location: true,
    },
    orderBy: { lastActivityAt: "desc" },
  });

  const currentToken = session.user.sessionToken ?? null;

  const items = sessions.map((s) => {
    const device = parseUserAgent(s.userAgent);
    return {
      id: s.id,
      isCurrent: currentToken ? s.sessionToken === currentToken : false,
      device: device.displayName,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      ipFirstSeen: s.ipFirstSeen,
      lastIp: s.lastIp,
      location: s.location ?? null,
      createdAt: s.createdAt.toISOString(),
      lastActivityAt: s.lastActivityAt.toISOString(),
      authLevel: s.authLevel,
    };
  });

  return apiSuccess({ sessions: items });
});

