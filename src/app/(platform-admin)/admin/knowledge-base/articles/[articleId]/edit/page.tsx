import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { KbArticleEditorClient } from "@/components/app/admin/kb-article-editor-client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ articleId: z.string().cuid() });

export default async function AdminKbArticleEditPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canRead = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: fullSession.user.role,
    permission: "admin.knowledge_base.read",
  });
  if (!canRead) notFound();

  const canManage = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: fullSession.user.role,
    permission: "admin.knowledge_base.manage",
  });

  const { articleId } = paramsSchema.parse(await params);

  const article = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
  });
  if (!article) notFound();

  const initialArticle = {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    bodyMarkdown: article.bodyMarkdown,
    articleType: article.articleType,
    visibility: article.visibility,
    status: article.status,
    isFeatured: article.isFeatured,
    sortOrder: article.sortOrder,
    categoryId: article.categoryId,
    tags: article.tags.map((t) => t.tag.name),
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">
        {canManage ? "Edit article" : "Article"}
      </h1>
      <p className="mt-1 text-sm text-(--text-muted)">{article.title}</p>
      <div className="mt-6">
        <KbArticleEditorClient
          mode="edit"
          articleId={article.id}
          initialArticle={initialArticle}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
