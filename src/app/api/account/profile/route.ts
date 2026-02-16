import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, profilePatchSchema } from "@/lib/validations";

const STEP_UP_WINDOW_SECONDS = 10 * 60;

/**
 * PATCH /api/account/profile
 * Update name, phone, timezone. Phone change requires step-up.
 */
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true, phone: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, profilePatchSchema);

  if (body.phone !== undefined && body.phone !== user.phone) {
    const iat = session.user.iat ?? 0;
    if (iat <= 0 || Date.now() / 1000 - iat > STEP_UP_WINDOW_SECONDS) {
      return apiError("FORBIDDEN", 403, "Recent authentication required to change phone.", {
        code: "NEED_STEP_UP",
      });
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.profile.updated",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
  });

  return apiSuccess({ ok: true });
});
