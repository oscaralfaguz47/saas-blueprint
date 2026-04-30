import "server-only";

import { prisma } from "@/server/db";

/**
 * Finds the least-loaded active platform admin for auto-assignment.
 * Active = not platform-blocked + has at least one VendorUserRole.
 * Least-loaded = fewest open (non-CLOSED) assigned tickets.
 * Returns the userId of the selected admin, or null if no eligible admin exists.
 */
export async function findLeastLoadedAdmin(): Promise<string | null> {
  try {
    const candidates = await prisma.user.findMany({
      where: {
        isPlatformBlocked: false,
        vendorUserRoles: { some: {} },
      },
      select: {
        id: true,
        _count: {
          select: {
            ticketsAssigned: {
              where: {
                status: { not: "CLOSED" },
              },
            },
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort(
      (a, b) => a._count.ticketsAssigned - b._count.ticketsAssigned
    );

    return sorted[0]?.id ?? null;
  } catch {
    return null;
  }
}
