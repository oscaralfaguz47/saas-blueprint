import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ sessionId: z.string().cuid() });

/**
 * DELETE /api/account/sessions/[sessionId]
 * Revoke a specific session. Cannot revoke the current session.
 */
export const DELETE = withErrorHandler(
  async (
    _req: Request,
    { params }: { params: Promise<{ sessionId: string }> },
  ) => {
    const session = await getServerSession(authOptions);
    const mfaError = await requireFullSession(session);
    if (mfaError) return mfaError;
    if (!session?.user) return ApiErrors.UNAUTHENTICATED();

    const raw = await params;
    const parse = paramsSchema.safeParse(raw);
    if (!parse.success) return ApiErrors.VALIDATION_ERROR("Invalid session id");

    const { sessionId } = parse.data;

    // Find session and verify ownership
    const target = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, sessionToken: true, revokedAt: true },
    });

    if (!target) return ApiErrors.NOT_FOUND("Session");
    if (target.userId !== session.user.id) return ApiErrors.FORBIDDEN();
    if (target.revokedAt) return apiSuccess({ ok: true, alreadyRevoked: true });

    // Cannot revoke current session via this endpoint
    if (session.user.sessionToken && target.sessionToken === session.user.sessionToken) {
      return ApiErrors.VALIDATION_ERROR(
        "Cannot revoke your current session. Use sign out instead."
      );
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), logoutReason: "user_revoked" },
    });

    return apiSuccess({ ok: true });
  },
);

