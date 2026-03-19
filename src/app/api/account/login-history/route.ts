import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseUserAgent } from "@/server/lib/device-parser";

const PAGE_SIZE = 10;

const ACTION_LABELS: Record<string, string> = {
  "auth.signin.success": "Signed in",
  "auth.signout": "Signed out",
  "auth.otp.sent": "Verification code sent",
  "auth.otp.verified": "Signed in with email code",
  "auth.otp.failed": "Failed sign-in attempt",
  "auth.passkey.used": "Signed in with passkey",
  "auth.passkey.failed": "Failed passkey sign-in",
  "auth.link.completed": "Linked sign-in method",
  "auth.link.failed": "Failed to link sign-in method",
};

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      actorUserId: session.user.id,
      action: {
        in: [
          "auth.signin.success",
          "auth.signout",
          "auth.otp.sent",
          "auth.otp.verified",
          "auth.otp.failed",
          "auth.passkey.used",
          "auth.passkey.failed",
          "auth.link.completed",
          "auth.link.failed",
        ],
      },
    },
    select: {
      id: true,
      action: true,
      metadata: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > PAGE_SIZE;
  const items = hasMore ? logs.slice(0, PAGE_SIZE) : logs;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  const mapped = await Promise.all(
    items.map(async (log) => {
      const device = parseUserAgent(log.userAgent);
      const meta = log.metadata as Record<string, unknown> | null;

      // Enrich with Session data when userAgent is missing from audit log
      // Match by userId and time window (+/-60 seconds)
      let enrichedDevice = device.displayName;
      let enrichedIp = log.ipAddress;
      let location: string | null = null;

      const isSignIn =
        log.action === "auth.signin.success" ||
        log.action === "auth.otp.verified" ||
        log.action === "auth.passkey.used";

      const isSignOut = log.action === "auth.signout";

      if (!log.userAgent || log.userAgent === "unknown") {
        // Find closest session by time
        const matchingSession = await prisma.session.findFirst({
          where: {
            userId: session.user.id,
            createdAt: isSignIn
              ? {
                  gte: new Date(log.createdAt.getTime() - 60_000),
                  lte: new Date(log.createdAt.getTime() + 60_000),
                }
              : undefined,
            // For signout, find by revokedAt time
            revokedAt: isSignOut
              ? {
                  gte: new Date(log.createdAt.getTime() - 60_000),
                  lte: new Date(log.createdAt.getTime() + 60_000),
                }
              : undefined,
          },
          select: { userAgent: true, lastIp: true, location: true },
          orderBy: isSignIn ? { createdAt: "desc" } : { revokedAt: "desc" },
        });

        if (matchingSession?.userAgent) {
          const sessionDevice = parseUserAgent(matchingSession.userAgent);
          enrichedDevice = sessionDevice.displayName;
        }
        if (matchingSession?.lastIp) enrichedIp = matchingSession.lastIp;
        if (matchingSession?.location) location = matchingSession.location;
      } else if (isSignIn) {
        // Has userAgent but still look up location from session
        const matchingSession = await prisma.session.findFirst({
          where: {
            userId: session.user.id,
            createdAt: {
              gte: new Date(log.createdAt.getTime() - 60_000),
              lte: new Date(log.createdAt.getTime() + 60_000),
            },
          },
          select: { location: true },
          orderBy: { createdAt: "desc" },
        });
        location = matchingSession?.location ?? null;
      }

      return {
        id: log.id,
        action: log.action,
        label: ACTION_LABELS[log.action] ?? log.action,
        method: (meta?.method as string) ?? null,
        provider: (meta?.provider as string) ?? null,
        device: enrichedDevice,
        deviceType: parseUserAgent(
          log.userAgent && log.userAgent !== "unknown"
            ? log.userAgent
            : null
        ).deviceType,
        ipAddress: enrichedIp,
        location,
        createdAt: log.createdAt.toISOString(),
      };
    })
  );

  return apiSuccess({ items: mapped, nextCursor, hasMore });
});

