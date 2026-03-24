import { KbArticleStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { indexKbArticle } from "@/server/knowledge-base/kb-indexer";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ articleId: z.string().cuid() });

export const POST = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ articleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { articleId } = paramsSchema.parse(await context.params);

  const article = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      status: true,
      title: true,
      slug: true,
      bodyMarkdown: true,
      categoryId: true,
    },
  });
  if (!article) return ApiErrors.NOT_FOUND("Article");
  if (article.status === KbArticleStatus.ARCHIVED) {
    return ApiErrors.CONFLICT("Archived articles cannot be published. Restore by creating a new draft from a copy if needed.");
  }
  if (!article.title.trim() || !article.slug.trim() || !article.bodyMarkdown.trim()) {
    return ApiErrors.VALIDATION_ERROR("Title, slug, and body are required to publish.");
  }

  await prisma.knowledgeBaseArticle.update({
    where: { id: articleId },
    data: {
      status: KbArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      updatedByUserId: session.user.id,
    },
  });

  try {
    await indexKbArticle(articleId);
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "KbIndexerError") {
      return ApiErrors.VALIDATION_ERROR("Article could not be indexed for search.");
    }
    throw e;
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action: "knowledge_base.article.published",
    targetType: "KnowledgeBaseArticle",
    targetId: articleId,
  });

  return apiSuccess({ ok: true as const });
});
