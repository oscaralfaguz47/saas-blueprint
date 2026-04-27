import "server-only";

import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { buildRecordAccessFilter } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * GET /api/records/summary
 * Returns summary metrics for the requests list page.
 * All counts are tenant-scoped and access-filtered (except pending-my-approval, which is user-inbox scoped).
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;
  const userId = session.user.id;

  const canReadAll = await hasTenantPermission({
    userId,
    tenantId,
    permission: "tenant.requests.read_all",
  });

  const accessFilter = buildRecordAccessFilter({ tenantId, userId, canReadAll });

  const openAmountWhere: Prisma.RecordWhereInput = {
    tenantId,
    status: { in: ["OPEN", "IN_REVIEW", "PENDING_APPROVAL", "AWAITING_INFO"] },
    requestedAmount: { not: null },
    ...accessFilter,
  };

  const [
    openCount,
    pendingMyApprovalCount,
    unreadMentionCount,
    overdueCount,
    awaitingInfoCount,
    hasPolicyExceptionCount,
    sharedWithMeCount,
    openAmountAgg,
    openAmountByCurrency,
  ] = await Promise.all([
    prisma.record.count({
      where: {
        tenantId,
        status: { in: ["OPEN", "IN_REVIEW", "PENDING_APPROVAL", "AWAITING_INFO"] },
        ...accessFilter,
      },
    }),

    prisma.record.count({
      where: {
        tenantId,
        participants: {
          some: {
            userId,
            participantType: "INTERNAL",
            participantRole: "APPROVER",
            status: "PENDING",
            revokedAt: null,
          },
        },
      },
    }),

    prisma.recordCommentMention.count({
      where: {
        tenantId,
        mentionedUserId: userId,
        isRead: false,
      },
    }),

    prisma.record.count({
      where: {
        tenantId,
        status: { notIn: ["CLOSED", "APPROVED", "REJECTED", "CANCELED"] },
        neededByDate: { lt: new Date() },
        ...accessFilter,
      },
    }),

    prisma.record.count({
      where: {
        tenantId,
        status: "AWAITING_INFO",
        ...accessFilter,
      },
    }),

    prisma.record.count({
      where: {
        tenantId,
        hasPolicyException: true,
        status: { notIn: ["CLOSED", "CANCELED"] },
        ...accessFilter,
      },
    }),

    prisma.record.count({
      where: {
        tenantId,
        access: {
          some: {
            userId,
            isViewed: false,
          },
        },
        NOT: { createdByUserId: userId },
      },
    }),

    prisma.record.aggregate({
      where: openAmountWhere,
      _sum: { requestedAmount: true },
    }),

    prisma.record.groupBy({
      by: ["currencyCode"],
      where: {
        ...openAmountWhere,
        currencyCode: { not: null },
      },
      _sum: { requestedAmount: true },
    }),
  ]);

  const totalOpenAmount = openAmountAgg._sum?.requestedAmount
    ? Number(openAmountAgg._sum.requestedAmount)
    : null;

  const totalOpenAmountByCurrency: Record<string, number> = {};
  for (const row of openAmountByCurrency) {
    if (row.currencyCode && row._sum?.requestedAmount != null) {
      totalOpenAmountByCurrency[row.currencyCode] = Number(row._sum.requestedAmount);
    }
  }

  return apiSuccess({
    openCount,
    pendingMyApprovalCount,
    unreadMentionCount,
    sharedWithMeCount,
    overdueCount,
    awaitingInfoCount,
    hasPolicyExceptionCount,
    totalOpenAmount,
    totalOpenAmountByCurrency,
  });
});
