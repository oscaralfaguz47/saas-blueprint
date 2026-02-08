import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getPresignedGetUrl } from "@/server/services/r2-logo";
import { ApiErrors, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";
import { NextResponse } from "next/server";

const tenantIdParamSchema = z.object({ tenantId: z.string().cuid() });

/**
 * GET /api/tenant/[tenantId]/logo
 * Redirects to a short-lived signed URL so the logo can be displayed (e.g. in <img src="...">).
 * Caller must have access to the tenant (membership).
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const { tenantId } = tenantIdParamSchema.parse(await context.params);

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
    select: { tenantId: true },
  });
  if (!membership) return ApiErrors.NOT_FOUND("Workspace");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoObjectKey: true },
  });
  if (!tenant?.logoObjectKey) return ApiErrors.NOT_FOUND("Logo");

  const url = await getPresignedGetUrl(tenant.logoObjectKey);
  if (!url) return ApiErrors.INTERNAL_ERROR("Logo URL is not available. Check R2 configuration (see docs/R2_SETUP.md).");

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(url);
  } catch {
    console.error("[api/tenant/logo] invalid signed URL shape");
    return ApiErrors.INTERNAL_ERROR("Invalid logo URL.");
  }
  try {
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[api/tenant/logo] redirect failed:", err);
    return ApiErrors.INTERNAL_ERROR("Could not redirect to logo URL.");
  }
});
