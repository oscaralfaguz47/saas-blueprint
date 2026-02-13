import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, autoLogoutPatchSchema } from "@/lib/validations";

const STEP_UP_WINDOW_SECONDS = 10 * 60;

/**
 * PATCH /api/account/auto-logout
 * Toggle inactivity auto-logout and set duration (15m, 30m, 1h, 5h, 8h). Step-up required.
 * When enabled, minutes is required (15, 30, 60, 300, 480).
 */
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const iat = session.user.iat ?? 0;
  if (iat <= 0 || Date.now() / 1000 - iat > STEP_UP_WINDOW_SECONDS) {
    return apiError(
      "FORBIDDEN",
      403,
      "Recent authentication required to change this setting.",
      { code: "NEED_STEP_UP" }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, autoLogoutPatchSchema);

  const minutes = body.enabled && body.minutes != null ? body.minutes : 300;

  await prisma.userSecurity.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      autoLogoutEnabled: body.enabled,
      autoLogoutMinutes: minutes,
    },
    update: {
      autoLogoutEnabled: body.enabled,
      autoLogoutMinutes: minutes,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: body.enabled ? "account.auto_logout.enabled" : "account.auto_logout.disabled",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
    metadata: body.enabled ? { minutes } : undefined,
  });

  return apiSuccess({ enabled: body.enabled, minutes });
});
