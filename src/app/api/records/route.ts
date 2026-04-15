import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { buildRecordAccessFilter } from "@/server/security/request-authorization";
import { checkMeterLimit, tryConsumeMeter } from "@/server/billing/try-consume-meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, createRecordSchema } from "@/lib/validations";

// ─── C2/C3 list query ─────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  tab: z.enum(["my", "shared", "inbox", "mentioned", "all"]).default("my"),
  status: z
    .enum(["OPEN", "CLOSED", "DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "NO_RESPONSE"])
    .optional(),
  type: z.enum(["SCOPE_CHANGE", "DECISION", "BUDGET"]).optional(),
  search: z.string().max(200).trim().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  amountMin: z.coerce.number().min(0).optional(),
  amountMax: z.coerce.number().min(0).optional(),
  paymentStatus: z.enum(["NOT_PAID", "PENDING", "PAID"]).optional(),
  hasEvidence: z.enum(["true", "false"]).optional(),
  hasLinks: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  sort: z.enum(["newest", "amount_desc"]).default("newest"),
});

// ─── GET /api/records ────────────────────────────────────────────────────────

/**
 * GET /api/records
 * C2/C3 — Tabbed list with filters; tenant + C1 access; cursor pagination.
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;
  const userId = session.user.id;

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parseResult = listQuerySchema.safeParse(rawParams);
  if (!parseResult.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters", parseResult.error.flatten());
  }
  const q = parseResult.data;

  if (q.amountMin != null && q.amountMax != null && q.amountMin > q.amountMax) {
    return ApiErrors.VALIDATION_ERROR("amountMin must be <= amountMax");
  }

  const canReadAll = await hasTenantPermission({
    userId,
    tenantId,
    permission: "tenant.requests.read_all",
  });

  if (q.tab === "all" && !canReadAll) {
    return ApiErrors.FORBIDDEN();
  }

  let tabFilter: Prisma.RecordWhereInput = {};
  switch (q.tab) {
    case "my":
      tabFilter = { createdByUserId: userId };
      break;
    case "shared":
      tabFilter = {
        access: { some: { userId } },
        NOT: { createdByUserId: userId },
      };
      break;
    case "inbox":
      tabFilter = {
        participants: {
          some: {
            userId,
            participantType: "INTERNAL",
            participantRole: "APPROVER",
            status: "PENDING",
          },
        },
      };
      break;
    case "mentioned":
      tabFilter = {
        comments: {
          some: {
            mentions: {
              some: { mentionedUserId: userId, isRead: false },
            },
          },
        },
      };
      break;
    case "all":
      tabFilter = {};
      break;
    default:
      tabFilter = {};
  }

  const filters: Prisma.RecordWhereInput[] = [];
  if (q.status) filters.push({ status: q.status });
  if (q.type) filters.push({ type: q.type });
  if (q.currency) filters.push({ currency: q.currency });
  if (q.search) {
    filters.push({
      OR: [
        { title: { contains: q.search, mode: "insensitive" } },
        { description: { contains: q.search, mode: "insensitive" } },
      ],
    });
  }
  if (q.amountMin != null) filters.push({ amount: { gte: q.amountMin } });
  if (q.amountMax != null) filters.push({ amount: { lte: q.amountMax } });
  if (q.dateFrom) filters.push({ createdAt: { gte: new Date(q.dateFrom) } });
  if (q.dateTo) filters.push({ createdAt: { lte: new Date(q.dateTo) } });
  if (q.paymentStatus) {
    filters.push({ payment: { status: q.paymentStatus } });
  }
  if (q.hasEvidence === "true") {
    filters.push({ evidence: { some: { deletedAt: null } } });
  } else if (q.hasEvidence === "false") {
    filters.push({ evidence: { none: { deletedAt: null } } });
  }
  if (q.hasLinks === "true") {
    filters.push({
      OR: [
        { links: { some: { removedAt: null } } },
        { linksTo: { some: { removedAt: null } } },
      ],
    });
  } else if (q.hasLinks === "false") {
    filters.push({
      AND: [
        { links: { none: { removedAt: null } } },
        { linksTo: { none: { removedAt: null } } },
      ],
    });
  }

  const accessFilter: Prisma.RecordWhereInput =
    q.tab === "all" ? {} : buildRecordAccessFilter({ tenantId, userId, canReadAll });

  const orderBy: Prisma.RecordOrderByWithRelationInput[] =
    q.sort === "amount_desc"
      ? [{ amount: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  const listWhere: Prisma.RecordWhereInput = {
    tenantId,
    ...tabFilter,
    ...accessFilter,
    ...(filters.length > 0 ? { AND: filters } : {}),
  };

  const listSelect = {
    id: true,
    title: true,
    type: true,
    status: true,
    amount: true,
    currency: true,
    createdByUserId: true,
    createdAt: true,
  } as const;

  const records = q.cursor
    ? await prisma.record.findMany({
        where: listWhere,
        orderBy,
        take: q.limit + 1,
        cursor: { id: q.cursor },
        skip: 1,
        select: listSelect,
      })
    : await prisma.record.findMany({
        where: listWhere,
        orderBy,
        take: q.limit + 1,
        select: listSelect,
      });

  const hasMore = records.length > q.limit;
  const page = hasMore ? records.slice(0, q.limit) : records;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const recordIds = page.map((r) => r.id);

  const [criticalGroups, unreadMentions] =
    recordIds.length > 0
      ? await Promise.all([
          prisma.recordComment.groupBy({
            by: ["recordId"],
            where: {
              tenantId,
              recordId: { in: recordIds },
              isCritical: true,
            },
            _count: { _all: true },
          }),
          prisma.recordCommentMention.findMany({
            where: {
              tenantId,
              recordId: { in: recordIds },
              mentionedUserId: userId,
              isRead: false,
            },
            select: { recordId: true },
          }),
        ])
      : [[], []];

  const criticalSet = new Set(criticalGroups.map((g) => g.recordId));
  const unreadMentionSet = new Set(unreadMentions.map((m) => m.recordId));

  const result = page.map((r) => ({
    ...r,
    hasCriticalComment: criticalSet.has(r.id),
    hasUnreadMention: unreadMentionSet.has(r.id),
  }));

  return apiSuccess({ records: result, nextCursor, hasMore });
});

// ─── POST /api/records ───────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: Request) => {
  // 1. Auth
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  // 2. Platform-block check
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  // 3. Tenant resolution (server-side, from membership)
  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  // 4. RBAC: require tenant.requests.create
  const canCreate = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.create",
  });
  if (!canCreate) return ApiErrors.FORBIDDEN();

  // 5. Rate limiting — authenticated tier: 30 creates per minute per user
  const rl = await checkRateLimit(
    `records:create:${session.user.id}`,
    30,
    60 * 1000
  );
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests. Please slow down.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  // 6. Validate body
  const body = await parseBody(req, createRecordSchema);

  const initialStatus = body.status ?? "OPEN";

  // 7. Plan limit check — only OPEN creates count against the requests meter
  if (initialStatus === "OPEN") {
    await checkMeterLimit({
      tenantId,
      meter: "REQUESTS",
      delta: 1,
    });
  }

  // 8. Create record + emit event + audit log in one transaction
  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.record.create({
      data: {
        tenantId,
        createdByUserId: session.user.id,
        title: body.title,
        type: body.type,
        description: body.description ?? null,
        clientName: body.clientName ?? null,
        clientEmail: body.clientEmail ?? null,
        amount: body.amount != null ? body.amount : null,
        currency: body.currency ?? null,
        visibility: body.visibility,
        isSensitive: body.isSensitive,
        status: initialStatus,
      },
      select: { id: true, title: true, type: true, status: true, createdAt: true },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId: record.id,
        eventType: "RECORD_CREATED",
        actorUserId: session.user.id,
        metadata: {
          title: record.title,
          type: record.type,
          ...(body.amount != null ? { amount: body.amount } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.created",
        targetType: "Record",
        targetId: record.id,
        metadata: {
          title: record.title,
          recordType: record.type,
          ...(body.amount != null ? { amount: body.amount } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
        },
      },
    });

    return record;
   });

  // 9. Increment usage counter only for OPEN creates (after successful transaction)
  if (initialStatus === "OPEN") {
    await tryConsumeMeter({
      tenantId,
      meter: "REQUESTS",
      delta: 1,
      idempotencyKey: `record.created.${created.id}`,
      sourceType: "record.created",
      sourceId: created.id,
      actorUserId: session.user.id,
    });
  }

  return apiSuccess(
    {
      id: created.id,
      title: created.title,
      type: created.type,
      status: created.status,
      createdAt: created.createdAt,
    },
    201
  );
});
