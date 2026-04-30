import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminUserSearchLimit } from "@/server/security/admin-rate-limit";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { adminUsersSearchQuerySchema } from "@/lib/validations/admin";

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.users.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminUserSearchLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many searches. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const url = new URL(req.url);
  const parsed = adminUsersSearchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit"),
    platformAdminsOnly: url.searchParams.get("platformAdminsOnly"),
  });
  if (!parsed.success)
    return ApiErrors.VALIDATION_ERROR("Invalid query", parsed.error.flatten());

  const { q, limit, platformAdminsOnly } = parsed.data;
  const term = q.trim();
  if (term.length < 2)
    return ApiErrors.VALIDATION_ERROR("Search term must be at least 2 characters.");

  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { email: { contains: term, mode: "insensitive" } },
            { name: { contains: term, mode: "insensitive" } },
          ],
        },
        ...(platformAdminsOnly
          ? [{ vendorUserRoles: { some: {} } }]
          : []),
        { isPlatformBlocked: false },
      ],
    },
    select: { id: true, name: true, email: true },
    take: Math.min(limit, 20),
    orderBy: { name: "asc" },
  });

  const items = users.map((u) => ({
    id: u.id,
    name: u.name ?? undefined,
    email: u.email ?? undefined,
  }));

  return apiSuccess({ items });
});
