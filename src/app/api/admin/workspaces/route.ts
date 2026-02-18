import { getServerSession } from "next-auth";
import type { TenantStatus } from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspacesListLimit } from "@/server/security/admin-rate-limit";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { adminWorkspacesListQuerySchema } from "@/lib/validations/admin";

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
    return parsed?.createdAt && parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  if (!checkAdminWorkspacesListLimit(session.user.id))
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.");

  const url = new URL(req.url);
  const parsed = adminWorkspacesListQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit"),
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    userIds: url.searchParams.get("userIds") ?? undefined,
  });
  if (!parsed.success)
    return ApiErrors.VALIDATION_ERROR("Invalid query", parsed.error.flatten());

  const { cursor, limit, q, status, userIds } = parsed.data;
  const take = Math.min(limit, 50);

  type Where = {
    status?: TenantStatus;
    OR?: Array<{ name?: { contains: string; mode: "insensitive" }; slug?: { contains: string; mode: "insensitive" } }>;
    id?: { in: string[] };
  };
  const where: Where = {};

  if (status) where.status = status;
  if (q?.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { slug: { contains: term, mode: "insensitive" } },
    ];
  }
  if (userIds?.length) {
    const membershipTenantIds = await prisma.tenantMembership.findMany({
      where: { userId: { in: userIds }, status: "ACTIVE" },
      select: { tenantId: true },
      distinct: ["tenantId"],
    });
    const ids = membershipTenantIds.map((m) => m.tenantId);
    if (ids.length === 0) {
      return apiSuccess({ items: [], nextCursor: null });
    }
    where.id = { in: ids };
  }

  const cursorWhere = cursor
    ? (() => {
        const decoded = decodeCursor(cursor);
        if (!decoded) return {};
        return {
          OR: [
            { createdAt: { lt: new Date(decoded.createdAt) } },
            { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
          ],
        };
      })()
    : {};

  const fullWhere = Object.keys(cursorWhere).length > 0 ? { ...where, ...cursorWhere } : where;

  const rows = await prisma.tenant.findMany({
    where: fullWhere,
    select: { id: true, name: true, slug: true, status: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor(last.createdAt.toISOString(), last.id)
      : null;

  const items = slice.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  }));

  return apiSuccess({ items, nextCursor });
});
