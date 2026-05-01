import "server-only";

import { getServerSession } from "next-auth";
import { FinanceStatus } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { financeQueueListQuerySchema } from "@/lib/validations/finance-queue";

/**
 * GET /api/finance/queue
 * C9 — Finance assignee queue: records assigned to the current user's membership.
 */
export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;
  const membershipId = membership.id;

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = financeQueueListQuerySchema.safeParse({
    limit: raw.limit,
    cursor: raw.cursor,
    status: raw.status,
  });
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters", parsed.error.flatten());
  }

  const q = parsed.data;
  const statusFilter =
    q.status && q.status.length > 0
      ? q.status
      : [FinanceStatus.ASSIGNED, FinanceStatus.IN_PROGRESS];

  const listWhere = {
    tenantId,
    financeAssignedMembershipId: membershipId,
    financeStatus: { in: statusFilter },
    financeAssignedAt: { not: null },
  } as const;

  const orderBy = [{ financeAssignedAt: "desc" as const }, { id: "desc" as const }];

  const listSelect = {
    id: true,
    recordKey: true,
    title: true,
    type: true,
    status: true,
    financeStatus: true,
    financeAssignedAt: true,
    requestedAmount: true,
    currencyCode: true,
    departmentId: true,
    priority: true,
    approvalStatus: true,
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
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  return apiSuccess({ items: page, nextCursor });
});
