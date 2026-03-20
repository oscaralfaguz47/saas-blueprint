import "server-only";

import { prisma } from "@/server/db";

/**
 * A5: Counts used for global onboarding routing (decision matrix).
 * - activeMembershipCount: ACTIVE memberships where tenant is ACTIVE
 * - pendingInvitationsCount: Invitations for user's email that are PENDING and not expired
 */
export async function getOnboardingCounts(userId: string): Promise<{
  activeMembershipCount: number;
  pendingInvitationsCount: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const emailNormalized = (user?.email ?? "").trim().toLowerCase();
  if (!emailNormalized) {
    const activeCount = await prisma.tenantMembership.count({
      where: {
        userId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
      },
    });
    return { activeMembershipCount: activeCount, pendingInvitationsCount: 0 };
  }

  const now = new Date();
  const [activeMembershipCount, pendingInvitationsCount] = await Promise.all([
    prisma.tenantMembership.count({
      where: {
        userId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
      },
    }),
    prisma.tenantInvitation.count({
      where: {
        email: { equals: emailNormalized, mode: "insensitive" },
        status: "PENDING",
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);

  return { activeMembershipCount, pendingInvitationsCount };
}
