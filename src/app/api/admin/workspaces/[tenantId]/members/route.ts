import { getServerSession } from "next-auth";
import type { MembershipStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminMembersOrInvitesListLimit } from "@/server/security/admin-rate-limit";
import { getHighestRoleName } from "@/server/security/authority";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { membersListQuerySchema } from "@/lib/validations/workspace-members";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

/** Admin allows limit up to 50 (EPIC: 25 default, max 50). */
const adminMembersListQuerySchema = membersListQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

function parseQuery(req: Request) {
  const url = new URL(req.url);
  return adminMembersListQuerySchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortDir: url.searchParams.get("sortDir") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    roles: url.searchParams.get("roles") ?? undefined,
    statuses: url.searchParams.get("statuses") ?? undefined,
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
  return Buffer.from(JSON.stringify({ id, sortValue }), "utf8").toString("base64url");
}

export const GET = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminMembersOrInvitesListLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const { tenantId } = paramsSchema.parse(await context.params);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

  let query;
  try {
    query = parseQuery(req);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const limit = query.limit;
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";

  const where: Prisma.TenantMembershipWhereInput = { tenantId };

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
    where.roles = { some: { role: { name: { in: query.roles } } } };
  }

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
    if (query.sortBy === "joined" || query.sortBy === "role") {
      const dateVal = new Date(sortValue).getTime();
      if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
      return {
        OR: [
          { joinedAt: { [cmp]: new Date(sortValue) } },
          { joinedAt: new Date(sortValue), id: { [cmpId]: cursorId } },
        ],
      };
    }
    if (query.sortBy === "status") {
      const statusVal = sortValue as MembershipStatus;
      return {
        OR: [
          { status: { [cmp]: statusVal } },
          { status: statusVal, id: { [cmpId]: cursorId } },
        ],
      };
    }
    if (query.sortBy === "user") {
      return {
        OR: [
          { user: { name: { [cmp]: sortValue } } },
          { user: { name: sortValue }, id: { [cmpId]: cursorId } },
        ],
      };
    }
    return { id: { [cmpId]: cursorId } };
  })();

  const fullWhere: Prisma.TenantMembershipWhereInput =
    Object.keys(cursorWhere).length > 0 ? { ...where, ...cursorWhere } : where;

  const rows = await prisma.tenantMembership.findMany({
    where: fullWhere,
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
          security: { select: { totpEnabled: true } },
        },
      },
      roles: { select: { role: { select: { name: true } } } },
    },
    orderBy: orderBy as Prisma.TenantMembershipOrderByWithRelationInput[],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  const userIds = slice.map((m) => m.user.id);

  const workspaceSecurity =
    userIds.length > 0
      ? await prisma.workspaceMemberSecurity.findMany({
          where: { tenantId, userId: { in: userIds } },
          select: { userId: true, mfaEnforced: true },
        })
      : [];
  const mfaEnforcedByUserId = new Map(workspaceSecurity.map((s) => [s.userId, s.mfaEnforced]));

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
    const isPrimaryOwner = roleNames.includes("Primary Owner");
    return {
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name ?? null,
      email: m.user.email ?? null,
      image: m.user.image ?? null,
      role: displayRole,
      status: m.status,
      joinedAt: m.joinedAt,
      isPrimaryOwner,
      mfaEnforced: mfaEnforcedByUserId.get(m.user.id) ?? false,
      totpEnabled: m.user.security?.totpEnabled ?? false,
    };
  });

  return apiSuccess({ items, nextCursor });
});
