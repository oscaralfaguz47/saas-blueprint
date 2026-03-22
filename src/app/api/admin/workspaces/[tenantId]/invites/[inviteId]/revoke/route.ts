import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminMutationLimit } from "@/server/security/admin-rate-limit";
import { executeRevokeInvitation } from "@/server/services/admin-workspace-governance";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({
  tenantId: z.string().cuid(),
  inviteId: z.string().cuid(),
});

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string; inviteId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminMutationLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many actions. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const { tenantId, inviteId } = paramsSchema.parse(await context.params);

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const result = await executeRevokeInvitation({
    tenantId,
    inviteId,
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    auditMeta: { ipAddress, userAgent },
  });

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return ApiErrors.NOT_FOUND(result.message);
    return ApiErrors.VALIDATION_ERROR(result.message);
  }
  return apiSuccess({ ok: true });
});
