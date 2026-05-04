import "server-only";

import { randomBytes } from "node:crypto";

import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { WebhookEndpointStatus } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { buildEventId } from "@/server/webhooks/enqueue";
import { deliverWebhook } from "@/server/webhooks/deliver";
import { decryptWebhookSecret } from "@/server/webhooks/secret-encryption";
import {
  assertOutboundWebhooksPlan,
  requireTenantWebhookManager,
} from "@/server/webhooks/webhook-endpoints-helpers";
import { truncateForStorage } from "@/server/webhooks/worker-helpers";

const paramsSchema = z.object({ endpointId: z.string().cuid() });

const TEST_EVENT_NAME = "webhook.test" as const;

/** CSPRNG id matching cuid2-style charset (leading letter) for `WebhookDelivery.id`. */
function createDeliveryCuid(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(25);
  let s = alphabet[bytes[0]! % 26]!;
  for (let i = 1; i < 25; i++) s += alphabet[bytes[i]! % 36]!;
  return s;
}

/**
 * POST /api/tenant/webhook-endpoints/[endpointId]/test
 * Sends a diagnostic `webhook.test` delivery (not in the subscribable event catalog).
 */
export const POST = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ endpointId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid endpoint id");
  const { endpointId } = paramsResult.data;

  const gate = await requireTenantWebhookManager(session.user.id);
  if (gate.error) return gate.error;
  const { tenant } = gate;

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      url: true,
      secretEncrypted: true,
      status: true,
    },
  });
  if (!endpoint) return ApiErrors.NOT_FOUND("Webhook endpoint");

  if (endpoint.status !== WebhookEndpointStatus.ACTIVE) {
    return ApiErrors.VALIDATION_ERROR(
      "This endpoint is not active, so it cannot receive a test delivery. Resume or reactivate it first."
    );
  }

  const planErr = await assertOutboundWebhooksPlan(tenant.id);
  if (planErr) return planErr;

  const rl = await checkRateLimit(`webhook:test:${tenant.id}:${endpointId}`, 5, 60_000);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many test deliveries for this endpoint.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  let secretPlain: string;
  try {
    secretPlain = decryptWebhookSecret(endpoint.secretEncrypted, env.WEBHOOK_SECRET_ENCRYPTION_KEY);
  } catch {
    console.error("[webhook-endpoint-test] decrypt failed", {
      tenantId: tenant.id,
      endpointId,
    });
    return ApiErrors.INTERNAL_ERROR("Could not use endpoint secret.");
  }

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { id: true, slug: true, name: true },
  });
  if (!tenantRow) return ApiErrors.NOT_FOUND("Tenant");

  const deliveryId = createDeliveryCuid();
  const occurredAt = new Date();
  const eventId = buildEventId(TEST_EVENT_NAME, `test:${deliveryId}`, occurredAt);

  const payload: Prisma.InputJsonValue = {
    id: eventId,
    event: TEST_EVENT_NAME,
    version: "v1",
    occurredAt: occurredAt.toISOString(),
    tenant: { id: tenantRow.id, slug: tenantRow.slug, name: tenantRow.name },
    data: { kind: "connectivity", source: "dashboard" },
  };

  const bodyUtf8 = JSON.stringify(payload);

  const deliverResult = await deliverWebhook({
    url: endpoint.url,
    secret: secretPlain,
    bodyUtf8,
    eventId,
    eventName: TEST_EVENT_NAME,
    deliveryId,
    attempt: 1,
    payloadVersion: "v1",
  });

  const terminalStatus: "SUCCEEDED" | "FAILED_FINAL" =
    deliverResult.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED_FINAL";

  const now = new Date();
  const excerpt = deliverResult.responseExcerpt
    ? truncateForStorage(deliverResult.responseExcerpt, 1000)
    : null;
  const errMsg =
    terminalStatus === "FAILED_FINAL" && deliverResult.errorMessage
      ? truncateForStorage(deliverResult.errorMessage, 500)
      : null;

  await prisma.webhookDelivery.create({
    data: {
      id: deliveryId,
      tenantId: tenant.id,
      endpointId: endpoint.id,
      eventId,
      eventName: TEST_EVENT_NAME,
      payloadVersion: "v1",
      payload,
      status: terminalStatus,
      attemptCount: 1,
      maxAttempts: 8,
      nextAttemptAt: null,
      lastResponseStatus: deliverResult.httpStatus ?? null,
      lastResponseDurationMs: deliverResult.durationMs,
      lastResponseBodyExcerpt: excerpt,
      lastErrorMessage: errMsg,
      succeededAt: terminalStatus === "SUCCEEDED" ? now : null,
      finalFailedAt: terminalStatus === "FAILED_FINAL" ? now : null,
    },
  });

  return apiSuccess({
    deliveryId,
    result: {
      status: terminalStatus,
      httpStatus: deliverResult.httpStatus,
      durationMs: deliverResult.durationMs,
      errorMessage:
        terminalStatus === "FAILED_FINAL" ? (deliverResult.errorMessage ?? null) : null,
    },
  });
});
