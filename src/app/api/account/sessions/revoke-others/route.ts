import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * POST /api/account/sessions/revoke-others
 * Revoke all sessions except the current one.
 */
export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const now = new Date();
  const currentToken = session.user.sessionToken ?? null;

  const result = await prisma.session.updateMany({
    where: {
      userId: session.user.id,
      revokedAt: null,
      ...(currentToken ? { sessionToken: { not: currentToken } } : {}),
    },
    data: { revokedAt: now, logoutReason: "user_revoked_others" },
  });

  return apiSuccess({ ok: true, revokedCount: result.count });
});

