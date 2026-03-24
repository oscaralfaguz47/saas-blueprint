import { getServerSession } from "next-auth";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId } from "@/server/billing/tenant-context";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { checkKbAiAnswerLimitUser } from "@/server/support/support-rate-limits";

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) {
    return ApiErrors.FORBIDDEN();
  }

  const rl = await checkKbAiAnswerLimitUser(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const row = await prisma.aiChatSession.create({
    data: {
      isAuthenticated: true,
      userId: session.user.id,
      tenantId,
    },
    select: { id: true },
  });

  return apiSuccess({ sessionId: row.id }, 201);
});
