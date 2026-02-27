import "server-only";

import { prisma } from "@/server/db";

/**
 * EPIC 5: Persist BillingEvent before any business processing (replay-safe, idempotent).
 * Returns true if event was inserted, false if already existed (caller may skip business logic or run idempotent handler).
 */
export async function persistBillingEventFirst(params: {
  providerEventId: string;
  eventType: string;
  payload: unknown;
}): Promise<boolean> {
  try {
    await prisma.billingEvent.create({
      data: {
        providerEventId: params.providerEventId,
        type: params.eventType,
        payload: (params.payload ?? {}) as object,
        tenantId: null,
        subscriptionId: null,
      },
    });
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return false;
    }
    throw e;
  }
}
