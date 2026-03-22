import "server-only";

import { prisma } from "@/server/db";

export type BillingEventProcessStatus =
  | "ok"
  | "failed"
  | "skipped"
  | "validation_error";

/**
 * Update the processStatus of a BillingEvent after processing completes.
 * Best-effort — errors are logged but not re-thrown to avoid masking the original result.
 */
export async function updateBillingEventStatus(
  billingEventId: string,
  status: BillingEventProcessStatus,
  errorSummary?: string
): Promise<void> {
  try {
    await prisma.billingEvent.update({
      where: { id: billingEventId },
      data: {
        processStatus: status,
        processedAt: new Date(),
        processError:
          errorSummary != null ? errorSummary.slice(0, 500) : null,
      },
    });
  } catch (err) {
    console.error("[billing/webhook] Failed to update BillingEvent status", {
      billingEventId,
      status,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
