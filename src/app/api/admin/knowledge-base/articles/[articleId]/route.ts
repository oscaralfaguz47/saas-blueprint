import { KbArticleStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { kbArticlePatchSchema } from "@/lib/validations/kb-admin";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { indexKbArticle } from "@/server/knowledge-base/kb-indexer";
import { syncKnowledgeBaseArticleTags } from "@/server/knowledge-base/kb-article-tags";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ articleId: z.string().cuid() });

export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ articleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { articleId } = paramsSchema.parse(await context.params);

  const article = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      bodyMarkdown: true,
      articleType: true,
      visibility: true,
      status: true,
      isFeatured: true,
      sortOrder: true,
      categoryId: true,
      publishedAt: true,
      lastIndexedAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true, slug: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
  });
  if (!article) return ApiErrors.NOT_FOUND("Article");

  const { tags: tagRows, ...rest } = article;
  return apiSuccess({
    article: {
      ...rest,
      tags: tagRows.map((t) => t.tag.name),
    },
  });
});

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ articleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { articleId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, kbArticlePatchSchema);

  const existing = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    select: { id: true, status: true, categoryId: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Article");

  if (body.categoryId) {
    const cat = await prisma.knowledgeBaseCategory.findUnique({
      where: { id: body.categoryId },
      select: { id: true },
    });
    if (!cat) return ApiErrors.NOT_FOUND("Category");
  }

  const data: Prisma.KnowledgeBaseArticleUpdateInput = {
    updatedBy: { connect: { id: session.user.id } },
  };
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) data.slug = body.slug;
  if (body.excerpt !== undefined) data.excerpt = body.excerpt;
  if (body.categoryId !== undefined) data.category = { connect: { id: body.categoryId } };
  if (body.articleType !== undefined) data.articleType = body.articleType;
  if (body.visibility !== undefined) data.visibility = body.visibility;
  if (body.isFeatured !== undefined) data.isFeatured = body.isFeatured;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.bodyMarkdown !== undefined) data.bodyMarkdown = body.bodyMarkdown;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.knowledgeBaseArticle.update({
      where: { id: articleId },
      data,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        bodyMarkdown: true,
        articleType: true,
        visibility: true,
        status: true,
        isFeatured: true,
        sortOrder: true,
        categoryId: true,
        publishedAt: true,
        lastIndexedAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    if (body.tags !== undefined) {
      await syncKnowledgeBaseArticleTags(articleId, body.tags, tx);
    }
    return row;
  });

  if (existing.status === KbArticleStatus.PUBLISHED && (body.bodyMarkdown !== undefined || body.visibility !== undefined)) {
    try {
      await indexKbArticle(articleId);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "KbIndexerError") {
        return ApiErrors.VALIDATION_ERROR("Updated article could not be re-indexed.");
      }
      throw e;
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action: "knowledge_base.article.updated",
    targetType: "KnowledgeBaseArticle",
    targetId: articleId,
  });

  const tagRows = await prisma.knowledgeBaseArticleTag.findMany({
    where: { articleId },
    include: { tag: { select: { name: true } } },
  });

  return apiSuccess({
    article: {
      ...updated,
      tags: tagRows.map((t) => t.tag.name),
    },
  });
});

export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ articleId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { articleId } = paramsSchema.parse(await context.params);

  const existing = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    select: { id: true, status: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Article");
  if (existing.status !== KbArticleStatus.ARCHIVED) {
    return ApiErrors.CONFLICT("Only archived articles can be deleted.");
  }

  await prisma.knowledgeBaseArticle.delete({ where: { id: articleId } });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action: "knowledge_base.article.deleted",
    targetType: "KnowledgeBaseArticle",
    targetId: articleId,
  });

  return apiSuccess({ ok: true as const });
});
