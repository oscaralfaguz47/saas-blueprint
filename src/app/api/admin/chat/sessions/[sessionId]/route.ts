import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspaceDetailLimit } from "@/server/security/admin-rate-limit";

const paramsSchema = z.object({ sessionId: z.string().cuid() });

export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ sessionId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspaceDetailLimit(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const { sessionId } = paramsSchema.parse(await context.params);

  const row = await prisma.aiChatSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          citedArticleIds: true,
          createdAt: true,
        },
      },
    },
  });
  if (!row) return ApiErrors.NOT_FOUND();

  const articleIds = Array.from(
    new Set(row.messages.flatMap((m) => m.citedArticleIds ?? []))
  );
  const articles =
    articleIds.length > 0
      ? await prisma.knowledgeBaseArticle.findMany({
          where: { id: { in: articleIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  return apiSuccess({
    session: {
      id: row.id,
      userId: row.userId,
      visitorEmail: row.visitorEmail,
      isAuthenticated: row.isAuthenticated,
      tenantId: row.tenantId,
      messageCount: row.messageCount,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      user: row.user,
    },
    messages: row.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citedArticleIds: m.citedArticleIds,
      citedArticles: (m.citedArticleIds ?? [])
        .map((id) => articleMap.get(id))
        .filter(Boolean),
      createdAt: m.createdAt.toISOString(),
    })),
  });
});
