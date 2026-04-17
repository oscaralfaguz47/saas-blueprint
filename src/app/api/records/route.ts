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

const RECORD_TYPES_FOR_FILTER = [
  "SCOPE_CHANGE",
  "DECISION",
  "BUDGET",
  "BUDGET_REQUEST",
  "SPEND_APPROVAL",
  "VENDOR_PAYMENT_REQUEST",
  "REIMBURSEMENT",
  "FINANCIAL_EXCEPTION",
  "CONTRACT_SCOPE_CHANGE",
  "FORECAST_ADJUSTMENT",
  "OTHER_FINANCIAL_REQUEST",
] as const;

function prismaDecimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ─── C2/C3 list query ─────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  tab: z.enum(["my", "shared", "inbox", "mentioned", "all"]).default("my"),
  status: z
    .enum([
      "OPEN",
      "CLOSED",
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "NO_RESPONSE",
      "IN_REVIEW",
      "AWAITING_INFO",
      "CANCELED",
    ])
    .optional(),
  type: z.enum(RECORD_TYPES_FOR_FILTER).optional(),
  category: z.enum(RECORD_TYPES_FOR_FILTER).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  hasPolicyException: z.enum(["true", "false"]).optional(),
  neededByFrom: z.string().datetime().optional(),
  neededByTo: z.string().datetime().optional(),
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
  sort: z
    .enum([
      "newest",
      "oldest",
      "amount_desc",
      "amount_asc",
      "needed_by_asc",
      "updated_desc",
    ])
    .default("newest"),
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
              some: { mentionedUserId: userId },
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
  const recordTypeFilter = q.category ?? q.type;
  if (recordTypeFilter) filters.push({ type: recordTypeFilter });
  if (q.priority) filters.push({ priority: q.priority });
  // Align with /api/records/summary: overdue = open-ish records with neededByDate in the past
  // (not the denormalized `overdue` flag alone — it can drift from neededByDate).
  if (q.overdue === "true") {
    filters.push({
      status: { notIn: ["CLOSED", "APPROVED", "REJECTED", "CANCELED"] },
      neededByDate: { lt: new Date() },
    });
  }
  if (q.overdue === "false") filters.push({ overdue: false });
  if (q.hasPolicyException === "true") {
    filters.push({
      hasPolicyException: true,
      status: { notIn: ["CLOSED", "CANCELED"] },
    });
  }
  if (q.hasPolicyException === "false") filters.push({ hasPolicyException: false });
  if (q.neededByFrom) filters.push({ neededByDate: { gte: new Date(q.neededByFrom) } });
  if (q.neededByTo) filters.push({ neededByDate: { lte: new Date(q.neededByTo) } });
  if (q.currency) {
    filters.push({
      OR: [{ currency: q.currency }, { currencyCode: q.currency }],
    });
  }
  if (q.search) {
    filters.push({
      OR: [
        { title: { contains: q.search, mode: "insensitive" } },
        { description: { contains: q.search, mode: "insensitive" } },
      ],
    });
  }
  if (q.amountMin != null && q.amountMin > 0) {
    filters.push({
      OR: [{ amount: { gte: q.amountMin } }, { requestedAmount: { gte: q.amountMin } }],
    });
  }
  if (q.amountMax != null && q.amountMax > 0) {
    filters.push({
      OR: [{ amount: { lte: q.amountMax } }, { requestedAmount: { lte: q.amountMax } }],
    });
  }
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

  const orderBy: Prisma.RecordOrderByWithRelationInput[] = (() => {
    switch (q.sort) {
      case "oldest":
        return [{ createdAt: "asc" }, { id: "asc" }];
      case "amount_desc":
        return [{ amount: "desc" }, { id: "desc" }];
      case "amount_asc":
        return [{ amount: "asc" }, { id: "asc" }];
      case "needed_by_asc":
        return [{ neededByDate: "asc" }, { id: "asc" }];
      case "updated_desc":
        return [{ updatedAt: "desc" }, { id: "desc" }];
      case "newest":
      default:
        return [{ createdAt: "desc" }, { id: "desc" }];
    }
  })();

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
    priority: true,
    neededByDate: true,
    requestedAmount: true,
    currencyCode: true,
    approvalStatus: true,
    overdue: true,
    hasPolicyException: true,
    recordKey: true,
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
    amount: prismaDecimalToNumber(r.amount),
    requestedAmount: prismaDecimalToNumber(r.requestedAmount),
    neededByDate: r.neededByDate ? r.neededByDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
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

  let resolvedCostCenterId: string | null = null;
  let resolvedDepartmentId: string | null = null;

  if (body.costCenterId) {
    const cc = await prisma.tenantCostCenter.findFirst({
      where: { id: body.costCenterId, tenantId, isActive: true },
      select: { id: true, departmentId: true },
    });
    if (!cc) {
      return ApiErrors.VALIDATION_ERROR("Invalid cost center.");
    }
    resolvedCostCenterId = cc.id;
    resolvedDepartmentId = cc.departmentId;
  }

  // 7. Plan limit check — only OPEN creates count against the requests meter
  if (initialStatus === "OPEN") {
    await checkMeterLimit({
      tenantId,
      meter: "REQUESTS",
      delta: 1,
    });
  }

  // 8. Create record + emit event + audit log in one transaction
  const legacyAmount =
    body.amount != null ? body.amount : body.requestedAmount != null ? body.requestedAmount : null;
  const legacyCurrency = body.currency ?? body.currencyCode ?? null;

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
        amount: legacyAmount,
        currency: legacyCurrency,
        visibility: body.visibility,
        isSensitive: body.isSensitive,
        status: initialStatus,
        requestedAmount: body.requestedAmount != null ? body.requestedAmount : null,
        currencyCode: body.currencyCode ?? body.currency ?? null,
        businessJustification: body.businessJustification ?? null,
        vendorName: body.vendorName ?? null,
        payeeName: body.payeeName ?? null,
        invoiceNumber: body.invoiceNumber ?? null,
        contractReference: body.contractReference ?? null,
        purchaseOrderRef: body.purchaseOrderRef ?? null,
        priority: body.priority ?? "MEDIUM",
        departmentName: body.departmentName ?? null,
        costCenterCode: body.costCenterCode ?? null,
        costCenterId: resolvedCostCenterId,
        departmentId: resolvedDepartmentId,
        neededByDate: body.neededByDate ? new Date(body.neededByDate) : null,
        hasPolicyException: body.hasPolicyException ?? false,
        policyExceptionReason: body.policyExceptionReason ?? null,
        isRecurring: body.isRecurring ?? false,
        recurrenceNotes: body.recurrenceNotes ?? null,
        amountIsEstimated: body.amountIsEstimated ?? false,
        budgetImpactType: body.budgetImpactType ?? null,
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        priority: true,
        requestedAmount: true,
        currencyCode: true,
        neededByDate: true,
      },
    });

    const seqCount = await tx.record.count({
      where: { tenantId },
    });
    const year = new Date().getFullYear();
    const seq = String(seqCount).padStart(6, "0");
    const recordKey = `REQ-${year}-${seq}`;

    const updatedRecord = await tx.record.update({
      where: { id: record.id },
      data: { recordKey },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        priority: true,
        requestedAmount: true,
        currencyCode: true,
        neededByDate: true,
        recordKey: true,
      },
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
          priority: body.priority,
          ...(body.amount != null ? { amount: body.amount } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.requestedAmount != null ? { requestedAmount: body.requestedAmount } : {}),
          ...(resolvedCostCenterId ? { costCenterId: resolvedCostCenterId } : {}),
          ...(resolvedDepartmentId ? { departmentId: resolvedDepartmentId } : {}),
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
          priority: body.priority,
          ...(body.amount != null ? { amount: body.amount } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.requestedAmount != null ? { requestedAmount: body.requestedAmount } : {}),
          ...(resolvedCostCenterId ? { costCenterId: resolvedCostCenterId } : {}),
          ...(resolvedDepartmentId ? { departmentId: resolvedDepartmentId } : {}),
        },
      },
    });

    return updatedRecord;
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
      priority: created.priority,
      requestedAmount: prismaDecimalToNumber(created.requestedAmount),
      currencyCode: created.currencyCode,
      neededByDate: created.neededByDate ? created.neededByDate.toISOString() : null,
      recordKey: created.recordKey,
    },
    201
  );
});
