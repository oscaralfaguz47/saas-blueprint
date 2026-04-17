import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
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
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
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
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          currency: true,
          timezone: true,
        },
      },
    },
    orderBy: [{ isDefaultTenant: "desc" }, { joinedAt: "desc" }],
  });

  // Ensure at most one isDefaultTenant true in response (fixes duplicate-default bug after disable/re-enable)
  const hasAnyDefault = memberships.some((m) => m.isDefaultTenant);
  const tenants = memberships.map((m, i) => ({
    ...m.tenant,
    isDefaultTenant: hasAnyDefault && i === 0,
  }));

  return apiSuccess({ tenants });
});

/** POST /api/tenant — create a new workspace (tenant) */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, createTenantSchema);
  const workspaceName = body.name.trim();

  // Step 1: Validate name uniqueness for this user BEFORE slug generation
  // This prevents creating "Acme Inc" if user already has "Acme Inc"
  // regardless of what slug gets generated
  const existingByName = await prisma.tenantMembership.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      tenant: {
        status: "ACTIVE",
        name: { equals: workspaceName, mode: "insensitive" },
      },
    },
    select: { id: true },
  });

  if (existingByName) {
    return ApiErrors.CONFLICT(
      "You already have a workspace with that name. Please choose a different name.",
      { code: "NAME_TAKEN", name: workspaceName }
    );
  }

  // Step 2: Derive base slug from name
  const baseSlug =
    workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "workspace";

  // Step 3: Try base slug, then with random suffix if globally taken
  let result: Awaited<ReturnType<typeof createTenantForUser>> | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${Math.floor(Math.random() * 9000) + 1000}`;

    try {
      result = await createTenantForUser({
        userId: session.user.id,
        slug,
        name: workspaceName,
        ipAddress: getIp(req),
        userAgent: getUserAgent(req),
      });
      break;
    } catch (err) {
      if (err instanceof SlugTakenError) continue;
      if (err instanceof WorkspaceNameTakenError) {
        return ApiErrors.CONFLICT(
          "You already have a workspace with that name. Please choose a different name.",
          { code: "NAME_TAKEN", name: workspaceName }
        );
      }
      throw err;
    }
  }

  if (!result) {
    return ApiErrors.CONFLICT(
      "Could not generate a unique workspace URL. Please try a different name.",
      { code: "SLUG_TAKEN" }
    );
  }

  return apiSuccess({ tenant: result.tenant }, 201);
});

/** PATCH /api/tenant — set default workspace (tenant) for the current user */
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
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
