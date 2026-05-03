import "server-only";

import { prisma } from "@/server/db";

/**
 * Recover deliveries stuck IN_FLIGHT: `nextAttemptAt` holds the claim time; rows older than 5 minutes
 * are treated as stale worker crashes and reset for retry.
 */
export async function resetStaleWebhookDeliveries(): Promise<{ reset: number }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "WebhookDelivery"
    SET
      "status" = 'FAILED_RETRY'::"WebhookDeliveryStatus",
      "nextAttemptAt" = NOW(),
      "lastErrorMessage" = 'stale_in_flight_reset'
    WHERE "status" = 'IN_FLIGHT'::"WebhookDeliveryStatus"
      AND "nextAttemptAt" < NOW() - INTERVAL '5 minutes'
    RETURNING "id"
  `;
  return { reset: rows.length };
}
