import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { isStepUpEligible } from "@/server/services/step-up";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, autoLogoutPatchSchema } from "@/lib/validations";

/**
 * PATCH /api/account/auto-logout
 * Toggle inactivity auto-logout and set duration (15m, 30m, 1h, 5h, 8h). Step-up required.
 * When enabled, minutes is required (15, 30, 60, 300, 480).
 */
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const sessionToken = session.user.sessionToken;
  if (!(await isStepUpEligible(sessionToken, session.user.id))) {
    return ApiErrors.STEP_UP_REQUIRED("Recent authentication required to change this setting.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, autoLogoutPatchSchema);

  const minutes = body.enabled && body.minutes != null ? body.minutes : 300;

  const existing = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: { autoLogoutEnabled: true, autoLogoutMinutes: true },
  });

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

  if (body.enabled) {
    if (existing?.autoLogoutEnabled && existing.autoLogoutMinutes !== minutes) {
      await writeAuditLog({
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: null,
        action: "account.auto_logout.minutes_changed",
        targetType: "User",
        targetId: session.user.id,
        targetUserId: session.user.id,
        metadata: { minutes },
      });
    } else if (!existing?.autoLogoutEnabled) {
      await writeAuditLog({
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: null,
        action: "account.auto_logout.enabled",
        targetType: "User",
        targetId: session.user.id,
        targetUserId: session.user.id,
        metadata: { minutes },
      });
    }
  } else {
    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId: null,
      action: "account.auto_logout.disabled",
      targetType: "User",
      targetId: session.user.id,
      targetUserId: session.user.id,
    });
  }

  return apiSuccess({ enabled: body.enabled, minutes });
});
