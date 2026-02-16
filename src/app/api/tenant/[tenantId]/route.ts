import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { assertWorkspaceNameUniqueForUser, WorkspaceNameTakenError } from "@/server/services/tenancy-bootstrap";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, workspaceSettingsSchema } from "@/lib/validations";
import { z } from "zod";

const tenantIdParamSchema = z.object({ tenantId: z.string().cuid() });

/** GET /api/tenant/[tenantId] — get workspace settings (for modal) */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const { tenantId } = tenantIdParamSchema.parse(await context.params);

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
    select: { tenantId: true },
  });
  if (!membership) return ApiErrors.NOT_FOUND("Workspace");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      logoObjectKey: true,
      timezone: true,
      currency: true,
      dateFormat: true,
      description: true,
    },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

  return apiSuccess({ tenant });
});

/** PATCH /api/tenant/[tenantId] — update workspace settings */
export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const { tenantId } = tenantIdParamSchema.parse(await context.params);

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.settings.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, workspaceSettingsSchema);

  if (body.name !== undefined && body.name.trim()) {
    try {
      await assertWorkspaceNameUniqueForUser(prisma, session.user.id, body.name.trim(), tenantId);
    } catch (err) {
      if (err instanceof WorkspaceNameTakenError)
        return ApiErrors.CONFLICT(err.message, { name: err.workspaceName });
      throw err;
    }
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim() || undefined;
  if (body.timezone !== undefined) data.timezone = body.timezone;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.dateFormat !== undefined) data.dateFormat = body.dateFormat;
  if (body.description !== undefined) data.description = body.description;

  if (Object.keys(data).length === 0) {
    const current = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, status: true, logoObjectKey: true, timezone: true, currency: true, dateFormat: true, description: true },
    });
    return apiSuccess({ tenant: current });
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      logoObjectKey: true,
      timezone: true,
      currency: true,
      dateFormat: true,
      description: true,
    },
  });

  return apiSuccess({ tenant });
});
