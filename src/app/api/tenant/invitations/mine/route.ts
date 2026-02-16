import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/** GET /api/tenant/invitations/mine — A5: active workspaces + pending invitations for current user */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const emailNormalized = (session.user.email ?? "").trim().toLowerCase();
  const now = new Date();

  const [activeWorkspaces, pendingInvitations] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: {
        userId: session.user.id,
        status: "ACTIVE",
        tenant: { status: { in: ["ACTIVE", "DRAFT"] } },
      },
      select: {
        id: true,
        tenantId: true,
        isDefaultTenant: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoObjectKey: true,
          },
        },
      },
      orderBy: [{ isDefaultTenant: "desc" }, { joinedAt: "desc" }],
    }),
    prisma.tenantInvitation.findMany({
      where: {
        email: { equals: emailNormalized, mode: "insensitive" },
        status: "PENDING",
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        tenantId: true,
        createdAt: true,
        expiresAt: true,
        tenant: { select: { name: true } },
        invitedByUser: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return apiSuccess({
    activeWorkspaces: activeWorkspaces.map((m) => ({
      membershipId: m.id,
      tenantId: m.tenantId,
      isDefault: m.isDefaultTenant,
      name: m.tenant.name,
      slug: m.tenant.slug,
      status: m.tenant.status,
      logoObjectKey: m.tenant.logoObjectKey,
    })),
    pendingInvitations: pendingInvitations.map((inv) => ({
      id: inv.id,
      tenantId: inv.tenantId,
      workspaceName: inv.tenant.name,
      invitedAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      invitedBy: inv.invitedByUser
        ? { name: inv.invitedByUser.name, email: inv.invitedByUser.email }
        : null,
    })),
  });
});
