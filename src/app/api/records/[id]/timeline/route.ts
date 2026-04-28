import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const PAGE_SIZE = 20;

/**
 * GET /api/records/[id]/timeline?cursor=<occurredAt ISO>&direction=older
 * Paginated timeline — newest first, load older on demand.
 */
export const GET = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { id: recordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const cursorDate = cursor ? new Date(cursor) : null;
  const cursorValid = cursorDate && !Number.isNaN(cursorDate.getTime());

  const where = {
    recordId,
    tenantId,
    ...(cursorValid ? { occurredAt: { lt: cursorDate } } : {}),
  };

  const events = await prisma.recordEvent.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: PAGE_SIZE + 1, // fetch one extra to know if there are more
    select: {
      id: true,
      eventType: true,
      actorUserId: true,
      actorEmail: true,
      metadata: true,
      occurredAt: true,
      actorUser: {
        select: { name: true, email: true },
      },
    },
  });

  const hasMore = events.length > PAGE_SIZE;
  const page = hasMore ? events.slice(0, PAGE_SIZE) : events;

  const serialized = page.map(({ actorUser, ...e }) => ({
    ...e,
    actorName: actorUser?.name ?? null,
    actorDisplayEmail: actorUser?.email ?? e.actorEmail ?? null,
    occurredAt: e.occurredAt.toISOString(),
  }));

  const nextCursor =
    hasMore && page.length > 0 ? page[page.length - 1]!.occurredAt.toISOString() : null;

  return apiSuccess({ events: serialized, hasMore, nextCursor });
});
