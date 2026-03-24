import { KbArticleStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { kbArticleCreateSchema, kbArticleListQuerySchema } from "@/lib/validations/kb-admin";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { indexKbArticle } from "@/server/knowledge-base/kb-indexer";
import { syncKnowledgeBaseArticleTags } from "@/server/knowledge-base/kb-article-tags";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = kbArticleListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters.");
  }
  const { page, limit, status, visibility, articleType, categoryId, isFeatured, q } = parsed.data;

  const where: Prisma.KnowledgeBaseArticleWhereInput = {};
  if (status) where.status = status;
  if (visibility) where.visibility = visibility;
  if (articleType) where.articleType = articleType;
  if (categoryId) where.categoryId = categoryId;
  if (isFeatured !== undefined) where.isFeatured = isFeatured;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.knowledgeBaseArticle.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        slug: true,
        articleType: true,
        visibility: true,
        status: true,
        isFeatured: true,
        publishedAt: true,
        lastIndexedAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.knowledgeBaseArticle.count({ where }),
  ]);

  return apiSuccess({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const body = await parseBody(req, kbArticleCreateSchema);

  const category = await prisma.knowledgeBaseCategory.findUnique({
    where: { id: body.categoryId },
    select: { id: true },
  });
  if (!category) return ApiErrors.NOT_FOUND("Category");

  const publishedAt = body.status === KbArticleStatus.PUBLISHED ? new Date() : null;

  const created = await prisma.$transaction(async (tx) => {
    const article = await tx.knowledgeBaseArticle.create({
      data: {
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt ?? null,
        bodyMarkdown: body.bodyMarkdown,
        articleType: body.articleType,
        visibility: body.visibility,
        status: body.status,
        isFeatured: body.isFeatured,
        sortOrder: body.sortOrder,
        categoryId: body.categoryId,
        publishedAt,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
      },
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
    await syncKnowledgeBaseArticleTags(article.id, body.tags, tx);
    return article;
  });

  if (body.status === KbArticleStatus.PUBLISHED) {
    try {
      await indexKbArticle(created.id);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "KbIndexerError") {
        return ApiErrors.VALIDATION_ERROR("Article could not be indexed. Check content and try again.");
      }
      throw e;
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action:
      body.status === KbArticleStatus.PUBLISHED
        ? "knowledge_base.article.published"
        : "knowledge_base.article.created",
    targetType: "KnowledgeBaseArticle",
    targetId: created.id,
  });

  const tags = await prisma.knowledgeBaseArticleTag.findMany({
    where: { articleId: created.id },
    include: { tag: { select: { name: true } } },
  });

  return apiSuccess(
    {
      article: {
        ...created,
        tags: tags.map((t) => t.tag.name),
      },
    },
    201
  );
});
