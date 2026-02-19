import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { getPeriodStartForDate } from "@/server/billing/get-or-create-billing-state";
import { usageLedgerQuerySchema } from "@/lib/validations/billing";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

function parseQuery(req: Request) {
  const url = new URL(req.url);
  return usageLedgerQuerySchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    meter: url.searchParams.get("meter") ?? undefined,
  });
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenant?.id;
  if (!tenantId) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.billing.manage",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  let query;
  try {
    query = parseQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const periodStart = getPeriodStartForDate(new Date());
  const where = {
    tenantId,
    periodStart,
    ...(query.meter ? { meter: query.meter } : {}),
  };

  const limit = Math.min(query.limit, 100);
  const entries = await prisma.tenantUsageLedger.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
    select: {
      id: true,
      periodStart: true,
      meter: true,
      delta: true,
      sourceType: true,
      sourceId: true,
      actorUserId: true,
      createdAt: true,
    },
  });

  const hasMore = entries.length > limit;
  const list = hasMore ? entries.slice(0, limit) : entries;
  const nextCursor = hasMore ? list[list.length - 1]?.id : null;

  return apiSuccess({
    entries: list.map((e) => ({
      id: e.id,
      periodStart: e.periodStart.toISOString(),
      meter: e.meter,
      delta: e.delta,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor,
  });
});
