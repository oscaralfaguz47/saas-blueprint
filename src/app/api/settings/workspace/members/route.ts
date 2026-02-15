import { getServerSession } from "next-auth";
import type { MembershipStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { getHighestRoleName } from "@/server/security/authority";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import {
  membersListQuerySchema,
  MEMBERS_PAGE_SIZE,
} from "@/lib/validations/workspace-members";

function parseQuery(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const sortBy = url.searchParams.get("sortBy") ?? undefined;
  const sortDir = url.searchParams.get("sortDir") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const roles = url.searchParams.get("roles") ?? undefined;
  const statuses = url.searchParams.get("statuses") ?? undefined;
  return membersListQuerySchema.parse({
    limit: limit ?? MEMBERS_PAGE_SIZE,
    cursor,
    sortBy,
    sortDir,
    search: search || undefined,
    roles,
    statuses,
  });
}

function decodeCursor(cursor: string): { id: string; sortValue: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { id: string; sortValue: string };
    return parsed?.id && parsed?.sortValue ? parsed : null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string, sortValue: string): string {
  return Buffer.from(JSON.stringify({ id, sortValue }), "utf8").toString(
    "base64url"
  );
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

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

  const where: {
    tenantId: string;
    status?: { in: string[] };
    user?: { OR?: { name?: { contains: string; mode: "insensitive" }; email?: { contains: string; mode: "insensitive" } }[] };
    roles?: { some: { role: { name: { in: string[] } } } };
  } = { tenantId: tenant.id };

  if (query.statuses?.length) {
    const valid = query.statuses.filter(
      (s): s is MembershipStatus => s === "ACTIVE" || s === "DISABLED"
    );
    if (valid.length) where.status = { in: valid };
  }
  if (query.search?.trim()) {
    const term = query.search.trim();
    where.user = {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ],
    };
  }
  if (query.roles?.length) {
    where.roles = {
      some: { role: { name: { in: query.roles } } },
    };
  }

  // Prisma does not support orderBy on many-to-many relation (roles.role.name);
  // for "role" we use joinedAt as proxy so cursor pagination stays stable.
  type OrderByItem =
    | { joinedAt: "asc" | "desc" }
    | { id: "asc" | "desc" }
    | { status: "asc" | "desc" }
    | { user: { name: "asc" | "desc" } };

  const orderByPrimary: OrderByItem =
    query.sortBy === "user"
      ? { user: { name: sortDir } }
      : query.sortBy === "status"
        ? { status: sortDir }
        : { joinedAt: sortDir };

  const orderBy: OrderByItem[] = [orderByPrimary, { id: sortDir }];

  const cursorWhere = (() => {
    if (!query.cursor) return {};
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return {};
    const { id: cursorId, sortValue } = decoded;
    const cmp = sortDir === "desc" ? "lt" : "gt";
    const cmpId = sortDir === "desc" ? "lt" : "gt";
    if (query.sortBy === "joined") {
      const dateVal = new Date(sortValue).getTime();
      if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
      return {
        OR: [
          { joinedAt: { [cmp]: new Date(sortValue) } },
          {
            joinedAt: new Date(sortValue),
            id: { [cmpId]: cursorId },
          },
        ],
      };
    }
    if (query.sortBy === "status") {
      return {
        OR: [
          { status: { [cmp]: sortValue } },
          { status: sortValue, id: { [cmpId]: cursorId } },
        ],
      };
    }
    if (query.sortBy === "user") {
      return {
        OR: [
          { user: { name: { [cmp]: sortValue } } },
          {
            user: { name: sortValue },
            id: { [cmpId]: cursorId },
          },
        ],
      };
    }
    if (query.sortBy === "role") {
      const dateVal = new Date(sortValue).getTime();
      if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
      return {
        OR: [
          { joinedAt: { [cmp]: new Date(sortValue) } },
          {
            joinedAt: new Date(sortValue),
            id: { [cmpId]: cursorId },
          },
        ],
      };
    }
    return { id: { [cmpId]: cursorId } };
  })();

  const fullWhere = Object.keys(cursorWhere).length
    ? { ...where, ...cursorWhere }
    : where;

  const rows = await prisma.tenantMembership.findMany({
    where: fullWhere as Prisma.TenantMembershipWhereInput,
    select: {
      id: true,
      status: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      },
      roles: {
        select: {
          role: { select: { name: true } },
        },
      },
    },
    orderBy: orderBy as Prisma.TenantMembershipOrderByWithRelationInput[],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && last) {
    const sortValue =
      query.sortBy === "joined" || query.sortBy === "role"
        ? (last.joinedAt?.toISOString() ?? "")
        : query.sortBy === "status"
          ? last.status
          : query.sortBy === "user"
            ? last.user.name ?? last.user.email ?? ""
            : last.id;
    nextCursor = encodeCursor(last.id, sortValue);
  }

  const items = slice.map((m) => {
    const roleNames = m.roles.map((r) => r.role.name);
    const displayRole = getHighestRoleName(roleNames) ?? "Member";
    return {
      userId: m.user.id,
      name: m.user.name ?? null,
      email: m.user.email ?? null,
      image: m.user.image ?? null,
      role: displayRole,
      status: m.status,
      joinedAt: m.joinedAt,
    };
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "tenant.users.read",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { count: items.length, cursor: !!query.cursor },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return apiSuccess({ items, nextCursor });
});
