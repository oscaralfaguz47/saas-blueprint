import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { WebhookDeliveryStatus, WebhookEndpointStatus } from "@prisma/client";

import type { WebhookEventName } from "@/lib/webhooks/event-catalog";
import { evaluateWebhooksPlanGate } from "@/lib/validations/webhook-plan-gate";
import { prisma } from "@/server/db";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { parseSubscribedEventsJson } from "@/server/webhooks/webhook-endpoints-helpers";

export type EnqueueWebhookResult = {
  enqueued: number;
  skipped: number;
  planBlocked: boolean;
};

export function buildEventId(
  eventName: string,
  recordId: string,
  occurredAt: Date
): string {
  const ts = Math.floor(occurredAt.getTime() / 1000);
  const candidate = `${eventName}:${recordId}:${ts}`;
  if (candidate.length <= 64) {
    return candidate;
  }
  const hash = createHash("sha256")
    .update(`${recordId}:${ts}`)
    .digest("hex")
    .slice(0, 32);
  const shortened = `${eventName}:${hash}`;
  return shortened.length <= 64 ? shortened : shortened.slice(0, 64);
}

function buildEnvelope(params: {
  eventId: string;
  eventName: WebhookEventName;
  occurredAt: Date;
  tenant: { id: string; slug: string; name: string };
  data: Record<string, unknown>;
}): Prisma.InputJsonValue {
  return {
    id: params.eventId,
    event: params.eventName,
    version: "v1",
    occurredAt: params.occurredAt.toISOString(),
    tenant: params.tenant,
    data: params.data,
  } as unknown as Prisma.InputJsonValue;
}

/**
 * Enqueues WebhookDelivery rows for ACTIVE endpoints subscribed to `eventName`.
 * Never throws — failures are logged and reflected in return counts only.
 */
export async function enqueueWebhookEvent(params: {
  tenantId: string;
  eventName: WebhookEventName;
  recordId: string;
  data: Record<string, unknown>;
  occurredAt: Date;
}): Promise<EnqueueWebhookResult> {
  try {
    const plan = await resolveTenantPlan(params.tenantId);
    const gate = evaluateWebhooksPlanGate(plan.features);
    if (!gate.ok) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[webhook-enqueue] plan blocked outbound webhooks", {
          tenantId: params.tenantId,
          eventName: params.eventName,
        });
      }
      return { enqueued: 0, skipped: 0, planBlocked: true };
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: params.tenantId },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      console.error("[webhook-enqueue] tenant missing for enqueue", {
        tenantId: params.tenantId,
        eventName: params.eventName,
        phase: "tenant_lookup",
      });
      return { enqueued: 0, skipped: 0, planBlocked: false };
    }

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        tenantId: params.tenantId,
        status: WebhookEndpointStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, subscribedEvents: true },
    });

    const subscribed = endpoints.filter((ep) =>
      parseSubscribedEventsJson(ep.subscribedEvents).includes(params.eventName)
    );

    if (subscribed.length === 0) {
      return { enqueued: 0, skipped: 0, planBlocked: false };
    }

    const eventId = buildEventId(
      params.eventName,
      params.recordId,
      params.occurredAt
    );

    const payload = buildEnvelope({
      eventId,
      eventName: params.eventName,
      occurredAt: params.occurredAt,
      tenant,
      data: params.data,
    });

    let enqueued = 0;
    let skipped = 0;

    for (const ep of subscribed) {
      try {
        await prisma.webhookDelivery.create({
          data: {
            tenantId: params.tenantId,
            endpointId: ep.id,
            eventId,
            eventName: params.eventName,
            payloadVersion: "v1",
            payload,
            status: WebhookDeliveryStatus.PENDING,
            nextAttemptAt: new Date(),
          },
        });
        enqueued += 1;
      } catch (e) {
        if (
          e instanceof PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          skipped += 1;
          continue;
        }
        console.error("[webhook-enqueue] delivery create failed", {
          tenantId: params.tenantId,
          eventName: params.eventName,
          recordId: params.recordId,
          endpointId: ep.id,
          phase: "create_delivery",
          code: e instanceof PrismaClientKnownRequestError ? e.code : "unknown",
        });
      }
    }

    return { enqueued, skipped, planBlocked: false };
  } catch (e) {
    console.error("[webhook-enqueue] unexpected failure", {
      tenantId: params.tenantId,
      eventName: params.eventName,
      recordId: params.recordId,
      phase: "outer",
      error: e instanceof Error ? e.message : String(e),
    });
    return { enqueued: 0, skipped: 0, planBlocked: false };
  }
}
