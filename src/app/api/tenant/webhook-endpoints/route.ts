import "server-only";

import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import {
  parseBody,
  webhookEndpointCreateSchema,
  webhookEndpointListQuerySchema,
} from "@/lib/validations";
import { validateWebhookUrl } from "@/server/webhooks/url-validation";
import { generateWebhookSecret } from "@/server/webhooks/secrets";
import {
  assertOutboundWebhooksPlan,
  endpointPublicSelect,
  mapPublicWebhookEndpoint,
  requireTenantWebhookManager,
  webhookUrlValidationMessage,
} from "@/server/webhooks/webhook-endpoints-helpers";

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

function parseListQuery(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  return webhookEndpointListQuerySchema.parse({
    limit: raw.limit,
    cursor: raw.cursor || undefined,
    status: raw.status || undefined,
    includeArchived: raw.includeArchived,
    sortDir: raw.sortDir,
  });
}

/**
 * GET /api/tenant/webhook-endpoints — cursor list (tenant.webhooks.manage).
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const gate = await requireTenantWebhookManager(session.user.id);
  if (gate.error) return gate.error;
  const tenantId = gate.tenant.id;

  let query;
  try {
    query = parseListQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 50);
  const sortDir = query.sortDir;

  const where: Prisma.WebhookEndpointWhereInput = { tenantId };
  if (!query.includeArchived) {
    where.deletedAt = null;
  }
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

  const orderBy: Prisma.WebhookEndpointOrderByWithRelationInput[] = [
    { createdAt: sortDir },
    { id: sortDir },
  ];

  const rows = await prisma.webhookEndpoint.findMany({
    where: fullWhere,
    orderBy,
    take: limit + 1,
    select: endpointPublicSelect,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor = encodeCursor(last.id, last.createdAt.toISOString());
  }

  return apiSuccess({
    items: slice.map(mapPublicWebhookEndpoint),
    nextCursor,
  });
});

/**
 * POST /api/tenant/webhook-endpoints — create (returns secret once).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const gate = await requireTenantWebhookManager(session.user.id);
  if (gate.error) return gate.error;
  const tenantId = gate.tenant.id;

  const planErr = await assertOutboundWebhooksPlan(tenantId);
  if (planErr) return planErr;

  const existingCount = await prisma.webhookEndpoint.count({
    where: { tenantId, deletedAt: null },
  });
  if (existingCount >= 10) {
    return ApiErrors.CONFLICT("Maximum 10 webhook endpoints reached");
  }

  const body = await parseBody(req, webhookEndpointCreateSchema);

  const urlCheck = await validateWebhookUrl(body.url);
  if (!urlCheck.ok) {
    return ApiErrors.VALIDATION_ERROR(webhookUrlValidationMessage(urlCheck.reason));
  }

  const { raw, hash, hint } = generateWebhookSecret();

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description ?? null,
        url: body.url.trim(),
        subscribedEvents: body.subscribedEvents,
        secretHash: hash,
        secretHint: hint,
        status: "ACTIVE",
        createdByUserId: session.user.id,
      },
      select: endpointPublicSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "tenant.webhook_endpoint.created",
        targetType: "WebhookEndpoint",
        targetId: created.id,
        metadata: {
          name: created.name,
          url: created.url,
          subscribedEvents: body.subscribedEvents,
          status: "ACTIVE",
        },
      },
    });

    return created;
  });

  return apiSuccess(
    {
      endpoint: mapPublicWebhookEndpoint(row),
      secret: raw,
    },
    201
  );
});
