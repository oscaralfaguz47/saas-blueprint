import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import {
  invitationsListQuerySchema,
  INVITATIONS_PAGE_SIZE,
} from "@/lib/validations/workspace-invitations";

function deriveInviteStatus(
  inv: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  },
  now: Date
): "ACTIVE" | "EXPIRED" | "REVOKED" | "ACCEPTED" {
  if (inv.acceptedAt) return "ACCEPTED";
  if (inv.revokedAt) return "REVOKED";
  if (inv.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

function parseQuery(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const sortBy = url.searchParams.get("sortBy") ?? undefined;
  const sortDir = url.searchParams.get("sortDir") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const statuses = url.searchParams.get("statuses") ?? undefined;
  return invitationsListQuerySchema.parse({
    limit: limit ?? INVITATIONS_PAGE_SIZE,
    cursor,
    sortBy,
    sortDir,
    search: search || undefined,
    statuses,
  });
}

function decodeCursor(
  cursor: string
): { id: string; sortValue: string; sortValueDate?: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      id: string;
      sortValue: string;
      sortValueDate?: string;
    };
    return parsed?.id && parsed?.sortValue != null ? parsed : null;
  } catch {
    return null;
  }
}

function encodeCursor(
  id: string,
  sortValue: string,
  sortValueDate?: string
): string {
  return Buffer.from(
    JSON.stringify({ id, sortValue, sortValueDate }),
    "utf8"
  ).toString("base64url");
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.users.read",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  let query;
  try {
    query = parseQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = Math.min(query.limit, 20);
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";
  const now = new Date();

  type Where = {
    tenantId: string;
    email?: { contains: string; mode: "insensitive" };
    OR?: Array<Record<string, unknown>>;
  };
  const where: Where = { tenantId: tenant.id };

  if (query.search?.trim()) {
    where.email = {
      contains: query.search.trim(),
      mode: "insensitive",
    };
  }
  if (query.statuses?.length) {
    const statuses = query.statuses;
    const orConditions: Array<Record<string, unknown>> = [];
    if (statuses.includes("ACCEPTED")) {
      orConditions.push({ acceptedAt: { not: null } });
    }
    if (statuses.includes("REVOKED")) {
      orConditions.push({ revokedAt: { not: null } });
    }
    if (statuses.includes("EXPIRED")) {
      orConditions.push({
        expiresAt: { lte: now },
        acceptedAt: null,
        revokedAt: null,
      });
    }
    if (statuses.includes("ACTIVE")) {
      orConditions.push({
        expiresAt: { gt: now },
        acceptedAt: null,
        revokedAt: null,
      });
    }
    if (orConditions.length) {
      where.OR = orConditions;
    }
  }

  type OrderByItem =
    | { createdAt: "asc" | "desc" }
    | { email: "asc" | "desc" }
    | { expiresAt: "asc" | "desc" }
    | { id: "asc" | "desc" };

  const orderByPrimary: OrderByItem =
    query.sortBy === "email"
      ? { email: sortDir }
      : query.sortBy === "expiresAt"
        ? { expiresAt: sortDir }
        : { createdAt: sortDir };

  const orderBy: OrderByItem[] = [orderByPrimary, { id: sortDir }];

  const cursorWhere = (() => {
    if (!query.cursor) return {};
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return {};
    const { id: cursorId, sortValue, sortValueDate } = decoded;
    const cmp = sortDir === "desc" ? "lt" : "gt";
    const cmpId = sortDir === "desc" ? "lt" : "gt";
    if (query.sortBy === "invitedAt") {
      const dateVal = sortValueDate
        ? new Date(sortValueDate).getTime()
        : new Date(sortValue).getTime();
      if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
      return {
        OR: [
          { createdAt: { [cmp]: new Date(sortValueDate ?? sortValue) } },
          {
            createdAt: new Date(sortValueDate ?? sortValue),
            id: { [cmpId]: cursorId },
          },
        ],
      };
    }
    if (query.sortBy === "email") {
      return {
        OR: [
          { email: { [cmp]: sortValue } },
          { email: sortValue, id: { [cmpId]: cursorId } },
        ],
      };
    }
    if (query.sortBy === "expiresAt") {
      const d = sortValueDate ?? sortValue;
      const dateVal = new Date(d).getTime();
      if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
      return {
        OR: [
          { expiresAt: { [cmp]: new Date(d) } },
          {
            expiresAt: new Date(d),
            id: { [cmpId]: cursorId },
          },
        ],
      };
    }
    return { id: { [cmpId]: cursorId } };
  })();

  const fullWhere =
    Object.keys(cursorWhere).length > 0
      ? { ...where, ...cursorWhere }
      : where;

  const rows = await prisma.tenantInvitation.findMany({
    where: fullWhere,
    select: {
      id: true,
      email: true,
      createdAt: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedByUser: { select: { name: true, email: true } },
    },
    orderBy,
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && last) {
    const sortVal =
      query.sortBy === "email"
        ? last.email
        : query.sortBy === "expiresAt"
          ? last.expiresAt.toISOString()
          : last.createdAt.toISOString();
    nextCursor = encodeCursor(
      last.id,
      sortVal,
      query.sortBy !== "email" ? sortVal : undefined
    );
  }

  const items = slice.map((inv) => ({
    id: inv.id,
    email: inv.email,
    status: deriveInviteStatus(inv, now),
    invitedAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    invitedBy: inv.invitedByUser
      ? {
          name: inv.invitedByUser.name,
          email: inv.invitedByUser.email,
        }
      : null,
  }));

  return apiSuccess({ items, nextCursor });
});
