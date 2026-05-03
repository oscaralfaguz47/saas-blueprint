import "server-only";

import type { Prisma } from "@prisma/client";
import { WebhookEndpointStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, webhookEndpointPatchSchema } from "@/lib/validations";
import {
  assertOutboundWebhooksPlan,
  endpointPublicSelect,
  mapPublicWebhookEndpoint,
  requireTenantWebhookManager,
  snapshotFromRow,
} from "@/server/webhooks/webhook-endpoints-helpers";

const paramsSchema = z.object({ endpointId: z.string().cuid() });

/**
 * GET /api/tenant/webhook-endpoints/[endpointId]
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ endpointId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) return ApiErrors.VALIDATION_ERROR("Invalid endpoint id");

  const gate = await requireTenantWebhookManager(session.user.id);
  if (gate.error) return gate.error;
  const tenant = gate.tenant;

  const row = await prisma.webhookEndpoint.findFirst({
    where: {
      id: paramsResult.data.endpointId,
      tenantId: tenant.id,
      deletedAt: null,
    },
    select: endpointPublicSelect,
  });
  if (!row) return ApiErrors.NOT_FOUND("Webhook endpoint");

  return apiSuccess(mapPublicWebhookEndpoint(row));
});

/**
 * PATCH /api/tenant/webhook-endpoints/[endpointId]
 */
export const PATCH = withErrorHandler(async (
  req: Request,
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
  const tenant = gate.tenant;

  const body = await parseBody(req, webhookEndpointPatchSchema);

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      url: true,
      subscribedEvents: true,
      status: true,
    },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Webhook endpoint");

  const activatingToActive =
    body.status === WebhookEndpointStatus.ACTIVE &&
    existing.status !== WebhookEndpointStatus.ACTIVE;

  if (activatingToActive) {
    const planErr = await assertOutboundWebhooksPlan(tenant.id);
    if (planErr) return planErr;
  }

  const before = snapshotFromRow(existing);

  const data: Prisma.WebhookEndpointUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.subscribedEvents !== undefined) data.subscribedEvents = body.subscribedEvents;
  if (body.status !== undefined) {
    data.status = body.status;
    if (
      body.status === WebhookEndpointStatus.ACTIVE &&
      existing.status === WebhookEndpointStatus.DISABLED_AUTO
    ) {
      data.consecutiveFailures = 0;
    }
  }

  const fieldsChanged: string[] = [];
  if (body.name !== undefined && body.name !== existing.name) fieldsChanged.push("name");
  if (
    body.description !== undefined &&
    (body.description ?? null) !== (existing.description ?? null)
  ) {
    fieldsChanged.push("description");
  }
  if (
    body.subscribedEvents !== undefined &&
    JSON.stringify(body.subscribedEvents) !==
      JSON.stringify(snapshotFromRow(existing).subscribedEvents)
  ) {
    fieldsChanged.push("subscribedEvents");
  }
  if (body.status !== undefined && body.status !== existing.status) {
    fieldsChanged.push("status");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.webhookEndpoint.update({
      where: { id: endpointId },
      data,
      select: endpointPublicSelect,
    });

    const after = snapshotFromRow(row);

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.webhook_endpoint.updated",
        targetType: "WebhookEndpoint",
        targetId: endpointId,
        metadata: {
          fieldsChanged,
          before,
          after,
        },
      },
    });

    return row;
  });

  return apiSuccess(mapPublicWebhookEndpoint(updated));
});

/**
 * DELETE /api/tenant/webhook-endpoints/[endpointId] — soft delete.
 */
export const DELETE = withErrorHandler(async (
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
  const tenant = gate.tenant;

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true, url: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Webhook endpoint");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.webhookEndpoint.update({
      where: { id: endpointId },
      data: { deletedAt: now },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.webhook_endpoint.deleted",
        targetType: "WebhookEndpoint",
        targetId: endpointId,
        metadata: {
          name: existing.name,
          url: existing.url,
        },
      },
    });
  });

  return apiSuccess({ ok: true as const });
});
