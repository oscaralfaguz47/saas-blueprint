import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { checkNotificationMarkReadLimit } from "@/server/support/support-rate-limits";

const paramsSchema = z.object({ notificationId: z.string().cuid() });

export const PATCH = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ notificationId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const userId = session.user.id;
  const rl = await checkNotificationMarkReadLimit(userId);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const { notificationId } = paramsSchema.parse(await context.params);
  const row = await prisma.userNotification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true, readAt: true },
  });
  if (!row) return ApiErrors.NOT_FOUND();

  if (row.readAt) {
    return apiSuccess({ ok: true });
  }

  await prisma.userNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  return apiSuccess({ ok: true });
});
