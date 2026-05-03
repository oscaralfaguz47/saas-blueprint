import "server-only";

import type { Prisma } from "@prisma/client";
import {
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
} from "@prisma/client";

import { env } from "@/lib/env";
import { evaluateWebhooksPlanGate } from "@/lib/validations/webhook-plan-gate";
import { prisma } from "@/server/db";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { deliverWebhook } from "@/server/webhooks/deliver";
import { decryptWebhookSecret } from "@/server/webhooks/secret-encryption";

import {
  nextRetryAtAfterFailedAttempt,
  shouldAutoDisableAfterReceiverFailure,
  truncateForStorage,
} from "./worker-helpers";

export const WEBHOOK_DELIVERY_BATCH_LIMIT = 50;

export type WebhookDeliveryWorkerStats = {
  claimed: number;
  succeeded: number;
  scheduledRetry: number;
  failedFinal: number;
  precheckFailedFinal: number;
  batchErrors: number;
};

/**
 * Claimed row after UPDATE: `nextAttemptAt` is the claim timestamp (clock for stale detection while IN_FLIGHT).
 * For PENDING/FAILED_RETRY rows not claimed, `nextAttemptAt` is the next scheduled attempt time.
 */
type ClaimedSqlRow = {
  id: string;
  tenantId: string;
  endpointId: string;
  eventId: string;
  eventName: string;
  payloadVersion: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
  maxAttempts: number;
};

async function claimDeliveries(): Promise<ClaimedSqlRow[]> {
  return prisma.$queryRaw<ClaimedSqlRow[]>`
    UPDATE "WebhookDelivery"
    SET
      "status" = 'IN_FLIGHT'::"WebhookDeliveryStatus",
      "attemptCount" = "attemptCount" + 1,
      "nextAttemptAt" = NOW()
    WHERE "id" IN (
      SELECT "id"
      FROM "WebhookDelivery"
      WHERE "status" IN (
        'PENDING'::"WebhookDeliveryStatus",
        'FAILED_RETRY'::"WebhookDeliveryStatus"
      )
        AND COALESCE("nextAttemptAt", NOW()) <= NOW()
      ORDER BY COALESCE("nextAttemptAt", NOW()) ASC
      LIMIT ${WEBHOOK_DELIVERY_BATCH_LIMIT}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      "id",
      "tenantId",
      "endpointId",
      "eventId",
      "eventName",
      "payloadVersion",
      "payload",
      "attemptCount",
      "maxAttempts"
  `;
}

function emptyStats(claimed: number): WebhookDeliveryWorkerStats {
  return {
    claimed,
    succeeded: 0,
    scheduledRetry: 0,
    failedFinal: 0,
    precheckFailedFinal: 0,
    batchErrors: 0,
  };
}

async function finalizePrecheck(
  deliveryId: string,
  message: string
): Promise<void> {
  const now = new Date();
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: WebhookDeliveryStatus.FAILED_FINAL,
      finalFailedAt: now,
      lastErrorMessage: truncateForStorage(message, 500),
      nextAttemptAt: null,
    },
  });
}

async function processClaimedRow(
  row: ClaimedSqlRow,
  stats: WebhookDeliveryWorkerStats
): Promise<void> {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: row.endpointId,
      tenantId: row.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      url: true,
      secretEncrypted: true,
      status: true,
    },
  });

  if (!endpoint || endpoint.tenantId !== row.tenantId) {
    stats.precheckFailedFinal++;
    await finalizePrecheck(row.id, "endpoint_unavailable");
    return;
  }

  if (endpoint.status !== WebhookEndpointStatus.ACTIVE) {
    stats.precheckFailedFinal++;
    await finalizePrecheck(row.id, "endpoint_unavailable");
    return;
  }

  const plan = await resolveTenantPlan(row.tenantId);
  const gate = evaluateWebhooksPlanGate(plan.features);
  if (!gate.ok) {
    stats.precheckFailedFinal++;
    await finalizePrecheck(row.id, "plan_webhooks_disabled");
    return;
  }

  let secretPlain: string;
  try {
    secretPlain = decryptWebhookSecret(
      endpoint.secretEncrypted,
      env.WEBHOOK_SECRET_ENCRYPTION_KEY
    );
  } catch {
    stats.precheckFailedFinal++;
    await finalizePrecheck(row.id, "decryption_failed");
    return;
  }

  const bodyUtf8 = JSON.stringify(row.payload);
  let result = await deliverWebhook({
    url: endpoint.url,
    secret: secretPlain,
    bodyUtf8,
    eventId: row.eventId,
    eventName: row.eventName,
    deliveryId: row.id,
    attempt: row.attemptCount,
    payloadVersion: row.payloadVersion,
  });

  if (
    result.status === WebhookDeliveryStatus.FAILED_RETRY &&
    row.attemptCount >= row.maxAttempts
  ) {
    result = {
      ...result,
      status: WebhookDeliveryStatus.FAILED_FINAL,
      errorMessage: truncateForStorage(
        `${result.errorMessage ?? "retry"};max_attempts_exhausted`,
        500
      ),
    };
  }

  const now = new Date();

  if (result.status === WebhookDeliveryStatus.SUCCEEDED) {
    stats.succeeded++;
    await prisma.$transaction(async (tx) => {
      await tx.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: WebhookDeliveryStatus.SUCCEEDED,
          succeededAt: now,
          lastResponseStatus: result.httpStatus ?? null,
          lastResponseDurationMs: result.durationMs,
          lastResponseBodyExcerpt: result.responseExcerpt
            ? truncateForStorage(result.responseExcerpt, 1000)
            : null,
          lastErrorMessage: null,
          nextAttemptAt: null,
        },
      });
      await tx.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          consecutiveFailures: 0,
          lastSuccessAt: now,
        },
      });
    });
    return;
  }

  if (result.status === WebhookDeliveryStatus.FAILED_RETRY) {
    stats.scheduledRetry++;
    const nextAt = nextRetryAtAfterFailedAttempt(row.attemptCount, now.getTime());
    await prisma.$transaction(async (tx) => {
      await tx.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: WebhookDeliveryStatus.FAILED_RETRY,
          nextAttemptAt: nextAt,
          lastResponseStatus: result.httpStatus ?? null,
          lastResponseDurationMs: result.durationMs,
          lastResponseBodyExcerpt: result.responseExcerpt
            ? truncateForStorage(result.responseExcerpt, 1000)
            : null,
          lastErrorMessage: result.errorMessage
            ? truncateForStorage(result.errorMessage, 500)
            : null,
        },
      });
      const ep = await tx.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          consecutiveFailures: { increment: 1 },
          lastFailureAt: now,
        },
        select: { consecutiveFailures: true, lastSuccessAt: true },
      });
      const auto = shouldAutoDisableAfterReceiverFailure(
        ep.consecutiveFailures,
        ep.lastSuccessAt,
        now
      );
      if (auto.disable && auto.reason) {
        await tx.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: {
            status: WebhookEndpointStatus.DISABLED_AUTO,
            disabledAutoAt: now,
            disabledAutoReason: auto.reason,
          },
        });
      }
    });
    return;
  }

  stats.failedFinal++;
  await prisma.$transaction(async (tx) => {
    await tx.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: WebhookDeliveryStatus.FAILED_FINAL,
        finalFailedAt: now,
        lastResponseStatus: result.httpStatus ?? null,
        lastResponseDurationMs: result.durationMs,
        lastResponseBodyExcerpt: result.responseExcerpt
          ? truncateForStorage(result.responseExcerpt, 1000)
          : null,
        lastErrorMessage: result.errorMessage
          ? truncateForStorage(result.errorMessage, 500)
          : null,
        nextAttemptAt: null,
      },
    });
    const ep = await tx.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        consecutiveFailures: { increment: 1 },
        lastFailureAt: now,
      },
      select: { consecutiveFailures: true, lastSuccessAt: true },
    });
    const auto = shouldAutoDisableAfterReceiverFailure(
      ep.consecutiveFailures,
      ep.lastSuccessAt,
      now
    );
    if (auto.disable && auto.reason) {
      await tx.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          status: WebhookEndpointStatus.DISABLED_AUTO,
          disabledAutoAt: now,
          disabledAutoReason: auto.reason,
        },
      });
    }
  });
}

export async function processWebhookDeliveries(): Promise<WebhookDeliveryWorkerStats> {
  const claimed = await claimDeliveries();
  const stats = emptyStats(claimed.length);
  for (const row of claimed) {
    try {
      await processClaimedRow(row, stats);
    } catch {
      stats.batchErrors++;
    }
  }
  return stats;
}
