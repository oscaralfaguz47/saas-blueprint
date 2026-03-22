import "server-only";

import { prisma } from "@/server/db";

/**
 * EPIC 5: Persist BillingEvent before any business processing (replay-safe, idempotent).
 * Returns:
 *   - { inserted: true, id: string } if this is a new event
 *   - { inserted: false, id: string } if already existed (caller may skip or run idempotent handler)
 *   - { inserted: false, id: null } if already existed but ID could not be retrieved (safe fallback)
 */
export async function persistBillingEventFirst(params: {
  providerEventId: string;
  eventType: string;
  payload: unknown;
}): Promise<{ inserted: boolean; id: string | null }> {
  try {
    const event = await prisma.billingEvent.create({
      data: {
        providerEventId: params.providerEventId,
        type: params.eventType,
        payload: (params.payload ?? {}) as object,
        tenantId: null,
        subscriptionId: null,
      },
      select: { id: true },
    });
    return { inserted: true, id: event.id };
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      try {
        const existing = await prisma.billingEvent.findUnique({
          where: { providerEventId: params.providerEventId },
          select: { id: true },
        });
        return { inserted: false, id: existing?.id ?? null };
      } catch {
        return { inserted: false, id: null };
      }
    }
    throw e;
  }
}
