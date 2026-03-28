import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminMutationLimit } from "@/server/security/admin-rate-limit";
import { executeTransferPrimaryOwner } from "@/server/services/admin-workspace-governance";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });
const bodySchema = z.object({
  newPrimaryOwnerUserId: z.string().cuid(),
  workspaceSlugConfirm: z.string().max(80).optional(),
});

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.suspend");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminMutationLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many actions. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const { tenantId } = paramsSchema.parse(await context.params);

  let body: z.infer<typeof bodySchema>;
  try {
    body = await parseBody(req, bodySchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");
  if (body.workspaceSlugConfirm !== undefined && body.workspaceSlugConfirm !== tenant.slug)
    return ApiErrors.VALIDATION_ERROR("Workspace slug confirmation does not match.");

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const result = await executeTransferPrimaryOwner({
    tenantId,
    newPrimaryOwnerUserId: body.newPrimaryOwnerUserId,
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
