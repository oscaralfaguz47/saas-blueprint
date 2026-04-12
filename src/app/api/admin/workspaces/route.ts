import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
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

function planFilterClause(
  plan: "free" | "starter" | "pro" | "scale",
): Prisma.TenantWhereInput {
  if (plan === "free") {
    return {
      OR: [
        { subscriptions: { none: { provider: "paddle" } } },
        {
          subscriptions: {
            some: {
              provider: "paddle",
              OR: [
                { currentEntitlementPlanCode: { equals: "free", mode: "insensitive" } },
                {
                  currentEntitlementPlanCode: null,
                  plan: { code: { equals: "free", mode: "insensitive" } },
                },
              ],
            },
          },
        },
      ],
    };
  }
  const matchCodes =
    plan === "scale" ? (["scale", "enterprise"] as const) : ([plan] as const);

  return {
    subscriptions: {
      some: {
        provider: "paddle",
        OR: [
          ...matchCodes.map((c) => ({
            currentEntitlementPlanCode: { equals: c, mode: "insensitive" as const },
          })),
          ...matchCodes.map((c) => ({
            currentEntitlementPlanCode: null,
            plan: { code: { equals: c, mode: "insensitive" as const } },
          })),
        ],
      },
    },
  };
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspacesListLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const url = new URL(req.url);
  const parsed = adminWorkspacesListQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit"),
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    userIds: url.searchParams.get("userIds") ?? undefined,
    plan: (() => {
      const p = url.searchParams.get("plan");
      return p?.trim() ? p : undefined;
    })(),
  });
  if (!parsed.success)
    return ApiErrors.VALIDATION_ERROR("Invalid query", parsed.error.flatten());

  const { cursor, limit, q, status, userIds, plan } = parsed.data;
  const take = Math.min(limit, 50);

  const base: Prisma.TenantWhereInput = {};

  if (status) base.status = status;
  if (q?.trim()) {
    const term = q.trim();
    base.OR = [
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
    base.id = { in: ids };
  }

  let where: Prisma.TenantWhereInput = base;
  if (plan) {
    const pf = planFilterClause(plan);
    where = Object.keys(base).length > 0 ? { AND: [base, pf] } : pf;
  }

  const cursorWhere: Prisma.TenantWhereInput | undefined = cursor
    ? (() => {
        const decoded = decodeCursor(cursor);
        if (!decoded) return undefined;
        return {
          OR: [
            { createdAt: { lt: new Date(decoded.createdAt) } },
            { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
          ],
        };
      })()
    : undefined;

  const fullWhere: Prisma.TenantWhereInput =
    cursorWhere !== undefined ? { AND: [where, cursorWhere] } : where;

  const rows = await prisma.tenant.findMany({
    where: fullWhere,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      subscriptions: {
        where: { provider: "paddle" },
        orderBy: { currentPeriodEnd: "desc" },
        take: 1,
        select: {
          currentEntitlementPlanCode: true,
          pendingPlanCode: true,
          pendingChangeType: true,
          entitlementEffectiveUntil: true,
          cancelAtPeriodEnd: true,
          plan: { select: { code: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;

  const items = slice.map((t) => {
    const sub = t.subscriptions?.[0] ?? null;
    const planCode = (
      sub?.currentEntitlementPlanCode ??
      sub?.plan?.code ??
      "free"
    ).toLowerCase();
    const pendingPlanCode = sub?.pendingPlanCode?.toLowerCase() ?? null;
    const pendingChangeType = sub?.pendingChangeType ?? null;
    const entitlementEffectiveUntil = sub?.entitlementEffectiveUntil?.toISOString() ?? null;

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      planCode,
      pendingPlanCode,
      pendingChangeType,
      entitlementEffectiveUntil,
    };
  });

  return apiSuccess({ items, nextCursor });
});
