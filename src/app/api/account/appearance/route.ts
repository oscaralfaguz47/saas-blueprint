import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, appearancePatchSchema } from "@/lib/validations";

/**
 * PATCH /api/account/appearance
 * Persist appearance mode (LIGHT | DARK | SYSTEM).
 */
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, appearancePatchSchema);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { appearance: body.mode },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.appearance.changed",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
    metadata: { mode: body.mode },
  });

  return apiSuccess({ mode: body.mode });
});
