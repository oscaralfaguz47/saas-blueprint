import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseUserAgent } from "@/server/lib/device-parser";

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = 5; // sessions per page
  const now = new Date();

  // Step 1: Clean up expired and old revoked sessions BEFORE querying
  // Await this so the findMany sees a clean state
  await prisma.session.deleteMany({
    where: {
      userId: session.user.id,
      // Do NOT delete the current session
      sessionToken: { not: session.user.sessionToken ?? "" },
      OR: [
        // Expired sessions
        { expires: { lt: now } },
        {
          revokedAt: { not: null },
        },
      ],
    },
  });

  // Step 2: Query clean active sessions
  const sessions = await prisma.session.findMany({
    where: {
      userId: session.user.id,
      revokedAt: null,
      expires: { gt: now },
      authLevel: "FULL",
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
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = sessions.length > limit;
  const items = hasMore ? sessions.slice(0, limit) : sessions;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
  const currentToken = session.user.sessionToken;

  const mapped = items.map((s) => {
    const device = parseUserAgent(s.userAgent);
    return {
      id: s.id,
      isCurrent: s.sessionToken === currentToken,
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

  return apiSuccess({ sessions: mapped, nextCursor, hasMore });
});

