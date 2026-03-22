import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminMutationLimit } from "@/server/security/admin-rate-limit";
import { executeChangeMemberRole } from "@/server/services/admin-workspace-governance";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, updateMemberRoleSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({
  tenantId: z.string().cuid(),
  membershipId: z.string().cuid(),
});

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string; membershipId: string }> }
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

  const { tenantId, membershipId } = paramsSchema.parse(await context.params);

  let body: { role: "Owner" | "Admin" | "Finance" | "Member" };
  try {
    body = await parseBody(req, updateMemberRoleSchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const result = await executeChangeMemberRole({
    tenantId,
    targetMembershipId: membershipId,
    newRole: body.role,
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    auditMeta: { ipAddress, userAgent },
  });

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return ApiErrors.NOT_FOUND(result.message);
    return ApiErrors.VALIDATION_ERROR(result.message, result.code ? { code: result.code } : undefined);
  }
  return apiSuccess({ ok: true });
});
