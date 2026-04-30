import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { checkNotificationPollLimit } from "@/server/support/support-rate-limits";
import { listNotifications } from "@/server/services/notifications";

const querySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// GET /api/app/notifications
// Returns unread count + most recent notifications for the authenticated user.
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

  const { items, nextCursor, unreadCount } = await listNotifications({
    userId,
    limit,
    cursor,
  });

  const notifications = items.map((n) => ({
    id: n.id,
    notificationType: n.notificationType,
    category: n.category,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    actionUrl: n.actionUrl,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));

  return apiSuccess({ unreadCount, notifications, nextCursor });
});
