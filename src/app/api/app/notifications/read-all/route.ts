import { getServerSession } from "next-auth";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { checkNotificationMarkAllReadLimit } from "@/server/support/support-rate-limits";
import { markNotificationsAsRead } from "@/server/services/notifications";

export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const userId = session.user.id;
  const rl = await checkNotificationMarkAllReadLimit(userId);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  await markNotificationsAsRead({ userId });

  return apiSuccess({ ok: true });
});
