import { KbArticleStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { clearKbArticleChunks } from "@/server/knowledge-base/kb-indexer";
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
    select: { id: true, status: true },
  });
  if (!article) return ApiErrors.NOT_FOUND("Article");
  if (article.status !== KbArticleStatus.PUBLISHED) {
    return ApiErrors.CONFLICT("Only published articles can be unpublished.");
  }

  await prisma.knowledgeBaseArticle.update({
    where: { id: articleId },
    data: {
      status: KbArticleStatus.DRAFT,
      publishedAt: null,
      updatedByUserId: session.user.id,
    },
  });
  await clearKbArticleChunks(articleId);

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action: "knowledge_base.article.unpublished",
    targetType: "KnowledgeBaseArticle",
    targetId: articleId,
  });

  return apiSuccess({ ok: true as const });
});
