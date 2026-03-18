import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { checkAndUpdateSessionActivity } from "@/server/services/inactivity";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * POST /api/account/activity-ping
 * Lightweight endpoint called by the client-side activity tracker.
 * Updates lastActivityAt if the session is still valid.
 * Returns expired: true if the session has timed out.
 */
export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.sessionToken) {
    return ApiErrors.UNAUTHENTICATED();
  }

  const result = await checkAndUpdateSessionActivity(session.user.sessionToken);

  if (result.status === "expired" || result.status === "session_not_found") {
    return apiSuccess({ expired: true });
  }

  return apiSuccess({ expired: false });
});
