import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import {
  checkAdminMembersOrInvitesListLimit,
  checkAdminMutationLimit,
} from "@/server/security/admin-rate-limit";
import { prisma } from "@/server/db";
import { executeCreateInvitation } from "@/server/services/admin-workspace-governance";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { invitationsListQuerySchema } from "@/lib/validations/workspace-invitations";
import { parseBody, createInvitationSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

/** Admin allows limit up to 50 (EPIC: 25 default, max 50). */
const adminInvitationsListQuerySchema = invitationsListQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

function deriveInviteStatus(
  inv: { status?: string; acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date
): "ACTIVE" | "EXPIRED" | "REVOKED" | "REJECTED" | "ACCEPTED" {
  if (inv.status === "ACCEPTED" || inv.acceptedAt) return "ACCEPTED";
  if (inv.status === "REVOKED" || inv.revokedAt) return "REVOKED";
  if (inv.status === "REJECTED") return "REJECTED";
  if (inv.status === "EXPIRED" || inv.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

function parseQuery(req: Request) {
  const url = new URL(req.url);
  return adminInvitationsListQuerySchema.parse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortDir: url.searchParams.get("sortDir") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    statuses: url.searchParams.get("statuses") ?? undefined,
  });
}

function decodeCursor(cursor: string): { id: string; sortValue: string; sortValueDate?: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { id: string; sortValue: string; sortValueDate?: string };
    return parsed?.id && parsed?.sortValue != null ? parsed : null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string, sortValue: string, sortValueDate?: string): string {
  return Buffer.from(JSON.stringify({ id, sortValue, sortValueDate }), "utf8").toString("base64url");
}

export const GET = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  if (!checkAdminMembersOrInvitesListLimit(session.user.id))
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.");

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
  const now = new Date();

  type Where = {
    tenantId: string;
    email?: { contains: string; mode: "insensitive" };
    OR?: Array<Record<string, unknown>>;
  };
  const where: Where = { tenantId };

  if (query.search?.trim()) {
    where.email = { contains: query.search.trim(), mode: "insensitive" };
  }
  if (query.statuses?.length) {
    const orConditions: Array<Record<string, unknown>> = [];
    if (query.statuses.includes("ACCEPTED")) orConditions.push({ status: "ACCEPTED" });
    if (query.statuses.includes("REVOKED")) orConditions.push({ status: "REVOKED" });
    if (query.statuses.includes("REJECTED")) orConditions.push({ status: "REJECTED" });
    if (query.statuses.includes("EXPIRED")) orConditions.push({ status: "EXPIRED" });
    if (query.statuses.includes("ACTIVE")) {
      orConditions.push({
        status: "PENDING",
        expiresAt: { gt: now },
        revokedAt: null,
      });
    }
    if (orConditions.length) where.OR = orConditions;
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
    if (query.sortBy === "invitedAt" || query.sortBy === "expiresAt" || !query.sortBy) {
      const d = sortValueDate ?? sortValue;
      const dateVal = new Date(d).getTime();
      if (isNaN(dateVal)) return { id: { [cmpId]: cursorId } };
      return {
        OR: [
          { createdAt: { [cmp]: new Date(d) } },
          { createdAt: new Date(d), id: { [cmpId]: cursorId } },
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
    return { id: { [cmpId]: cursorId } };
  })();

  const fullWhere = Object.keys(cursorWhere).length > 0 ? { ...where, ...cursorWhere } : where;

  const rows = await prisma.tenantInvitation.findMany({
    where: fullWhere,
    select: {
      id: true,
      email: true,
      status: true,
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
    nextCursor = encodeCursor(last.id, sortVal, query.sortBy !== "email" ? sortVal : undefined);
  }

  const items = slice.map((inv) => ({
    id: inv.id,
    email: inv.email,
    status: deriveInviteStatus(inv, now),
    invitedAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    invitedBy: inv.invitedByUser
      ? { name: inv.invitedByUser.name, email: inv.invitedByUser.email }
      : null,
  }));

  return apiSuccess({ items, nextCursor });
});

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  if (!checkAdminMutationLimit(session.user.id))
    return ApiErrors.RATE_LIMITED("Too many actions. Try again in a minute.");

  const { tenantId } = paramsSchema.parse(await context.params);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

  let body: { email: string; sendEmail?: boolean };
  try {
    body = await parseBody(req, createInvitationSchema);
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const result = await executeCreateInvitation({
    tenantId,
    email: body.email,
    sendEmail: body.sendEmail !== false,
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    req,
  });

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return ApiErrors.NOT_FOUND(result.message);
    if (result.error === "VALIDATION") return ApiErrors.VALIDATION_ERROR(result.message);
    return ApiErrors.CONFLICT(result.message, { code: result.code });
  }
  return apiSuccess({
    invitation: result.invitation,
    inviteUrl: result.inviteUrl,
  });
});
