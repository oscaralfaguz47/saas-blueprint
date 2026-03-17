import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

/**
 * GET /api/records/[id]
 * Returns a single record if the user has request-level access (per authorization rule).
 * Uses shared canAccessRequest helper; returns 404 when access is denied (resource concealment).
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const allowed = await canAccessRequest({
    tenantId: membership.tenant.id,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!allowed) return ApiErrors.NOT_FOUND("Record");

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId: membership.tenant.id },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      description: true,
      clientName: true,
      clientEmail: true,
      amount: true,
      currency: true,
      visibility: true,
      isSensitive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!record) return ApiErrors.NOT_FOUND("Record");

  return apiSuccess(record);
});
