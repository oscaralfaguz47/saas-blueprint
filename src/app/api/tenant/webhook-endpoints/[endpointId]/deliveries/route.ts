import "server-only";

import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { webhookEndpointDeliveriesListQuerySchema } from "@/lib/validations";
import {
  deliveryPublicSelect,
  mapPublicWebhookDelivery,
  requireTenantWebhookManager,
} from "@/server/webhooks/webhook-endpoints-helpers";

const paramsSchema = z.object({ endpointId: z.string().cuid() });

function decodeCursor(cursor: string): { id: string; sortValue: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { id?: string; sortValue?: string };
    return parsed?.id && parsed?.sortValue ? { id: parsed.id, sortValue: parsed.sortValue } : null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string, sortValue: string): string {
  return Buffer.from(JSON.stringify({ id, sortValue }), "utf8").toString("base64url");
}

function parseDeliveriesQuery(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  return webhookEndpointDeliveriesListQuerySchema.parse({
    limit: raw.limit,
    cursor: raw.cursor || undefined,
    status: raw.status || undefined,
  });
}

/**
 * GET /api/tenant/webhook-endpoints/[endpointId]/deliveries — read-only history (tenant.webhooks.manage).
 */
export const GET = withErrorHandler(async (
  req: Request,
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

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: paramsResult.data.endpointId,
      tenantId: tenant.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!endpoint) return ApiErrors.NOT_FOUND("Webhook endpoint");

  let query: z.infer<typeof webhookEndpointDeliveriesListQuerySchema>;
  try {
    query = parseDeliveriesQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 50);
  const sortDir = "desc" as const;
  const endpointId = paramsResult.data.endpointId;

  const where: Prisma.WebhookDeliveryWhereInput = {
    tenantId: tenant.id,
    endpointId,
  };
  if (query.status) {
    where.status = query.status;
  }

  const cursorWhere = (() => {
    if (!query.cursor) return {};
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return {};
    const { id: cursorId, sortValue } = decoded;
    const cmp = sortDir === "desc" ? "lt" : "gt";
    const cmpId = sortDir === "desc" ? "lt" : "gt";
    const dateVal = new Date(sortValue).getTime();
    if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
    return {
      OR: [
        { createdAt: { [cmp]: new Date(sortValue) } },
        {
          createdAt: new Date(sortValue),
          id: { [cmpId]: cursorId },
        },
      ],
    };
  })();

  const fullWhere =
    Object.keys(cursorWhere).length > 0 ? { ...where, ...cursorWhere } : where;

  const orderBy: Prisma.WebhookDeliveryOrderByWithRelationInput[] = [
    { createdAt: sortDir },
    { id: sortDir },
  ];

  const rows = await prisma.webhookDelivery.findMany({
    where: fullWhere,
    orderBy,
    take: limit + 1,
    select: deliveryPublicSelect,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor = encodeCursor(last.id, last.createdAt.toISOString());
  }

  return apiSuccess({
    items: slice.map(mapPublicWebhookDelivery),
    nextCursor,
  });
});
