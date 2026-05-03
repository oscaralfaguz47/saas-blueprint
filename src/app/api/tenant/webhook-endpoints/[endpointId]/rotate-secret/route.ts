import "server-only";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { generateWebhookSecret } from "@/server/webhooks/secrets";
import {
  assertOutboundWebhooksPlan,
  endpointPublicSelect,
  mapPublicWebhookEndpoint,
  requireTenantWebhookManager,
} from "@/server/webhooks/webhook-endpoints-helpers";

const paramsSchema = z.object({ endpointId: z.string().cuid() });

/**
 * POST /api/tenant/webhook-endpoints/[endpointId]/rotate-secret
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
  const tenant = gate.tenant;

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Webhook endpoint");

  const planErr = await assertOutboundWebhooksPlan(tenant.id);
  if (planErr) return planErr;

  const { raw, hash, hint } = generateWebhookSecret();

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        secretHash: hash,
        secretHint: hint,
      },
      select: endpointPublicSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId: tenant.id,
        action: "tenant.webhook_endpoint.secret_rotated",
        targetType: "WebhookEndpoint",
        targetId: endpointId,
        metadata: {
          name: existing.name,
        },
      },
    });

    return updated;
  });

  return apiSuccess({
    endpoint: mapPublicWebhookEndpoint(row),
    secret: raw,
  });
});
