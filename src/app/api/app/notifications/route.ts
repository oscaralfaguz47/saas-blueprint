import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { checkNotificationPollLimit } from "@/server/support/support-rate-limits";

const querySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// GET /api/app/notifications
// Returns unread count + most recent 20 notifications for the authenticated user.
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const userId = session.user.id;
  const rl = await checkNotificationPollLimit(userId);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  const { cursor, limit } = parsed.data;

  const [unreadCount, notifications] = await prisma.$transaction([
    prisma.userNotification.count({
      where: { userId, readAt: null },
    }),
    prisma.userNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: cursor ? { userId, createdAt: { lt: new Date(cursor) } } : { userId },
      select: {
        id: true,
        notificationType: true,
        title: true,
        body: true,
        entityType: true,
        entityId: true,
        actionUrl: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  const nextCursor =
    notifications.length === limit ? notifications[notifications.length - 1]!.createdAt.toISOString() : null;

  return apiSuccess({ unreadCount, notifications, nextCursor });
});
