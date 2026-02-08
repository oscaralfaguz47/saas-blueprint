import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { createTenantForUser, SlugTakenError, WorkspaceNameTakenError } from "@/server/services/tenancy-bootstrap";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, createTenantSchema, setDefaultTenantSchema } from "@/lib/validations";

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}

/** GET /api/tenant — list workspaces (tenants) for the current user */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const memberships = await prisma.tenantMembership.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
    },
    select: {
      isDefaultTenant: true,
      tenant: {
        select: { id: true, name: true, slug: true, status: true },
      },
    },
    orderBy: [{ isDefaultTenant: "desc" }, { joinedAt: "desc" }],
  });

  const tenants = memberships.map((m) => ({
    ...m.tenant,
    isDefaultTenant: m.isDefaultTenant,
  }));

  return apiSuccess({ tenants });
});

/** POST /api/tenant — create a new workspace (tenant) */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, createTenantSchema);

  try {
    const result = await createTenantForUser({
      userId: session.user.id,
      slug: body.slug,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    });
    return apiSuccess({ tenant: result.tenant }, 201);
  } catch (err) {
    if (err instanceof SlugTakenError)
      return ApiErrors.CONFLICT(err.message, { slug: err.slug });
    if (err instanceof WorkspaceNameTakenError)
      return ApiErrors.CONFLICT(err.message, { name: err.workspaceName });
    throw err;
  }
});

/** PATCH /api/tenant — set default workspace (tenant) for the current user */
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await parseBody(req, setDefaultTenantSchema);

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: { tenantId: body.tenantId, userId: session.user.id },
    },
    select: { id: true, tenantId: true },
  });

  if (!membership || membership.tenantId !== body.tenantId)
    return ApiErrors.NOT_FOUND("Workspace");

  await prisma.$transaction([
    prisma.tenantMembership.updateMany({
      where: { userId: session.user.id },
      data: { isDefaultTenant: false },
    }),
    prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { isDefaultTenant: true },
    }),
  ]);

  return apiSuccess({ ok: true });
});
