import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspacesListLimit } from "@/server/security/admin-rate-limit";

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(30),
  isAuthenticated: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspacesListLimit(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    isAuthenticated: url.searchParams.get("isAuthenticated") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const { page, limit, isAuthenticated, q } = parsed.data;
  const skip = (page - 1) * limit;

  const where: Prisma.AiChatSessionWhereInput = {};
  if (isAuthenticated === "true") {
    where.isAuthenticated = true;
  } else if (isAuthenticated === "false") {
    where.isAuthenticated = false;
  }

  const qt = q?.trim();
  if (qt) {
    where.OR = [
      { visitorEmail: { contains: qt, mode: "insensitive" } },
      { userId: { contains: qt, mode: "insensitive" } },
      { user: { email: { contains: qt, mode: "insensitive" } } },
    ];
  }

  const [total, sessions] = await prisma.$transaction([
    prisma.aiChatSession.count({ where }),
    prisma.aiChatSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        userId: true,
        visitorEmail: true,
        isAuthenticated: true,
        messageCount: true,
        startedAt: true,
        endedAt: true,
      },
    }),
  ]);

  return apiSuccess({
    sessions: sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      visitorEmail: s.visitorEmail,
      isAuthenticated: s.isAuthenticated,
      messageCount: s.messageCount,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    })),
    total,
    page,
  });
});
