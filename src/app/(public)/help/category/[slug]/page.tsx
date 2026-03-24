import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { kbVisibilityFilterForHelpSurface } from "@/server/knowledge-base/kb-public-visibility";
import { KbArticleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function PublicHelpCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;
  const visibility = kbVisibilityFilterForHelpSurface(isAuthenticated);

  const { slug } = await params;

  const category = await prisma.knowledgeBaseCategory.findFirst({
    where: { slug, isPublished: true },
  });
  if (!category) notFound();

  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: {
      categoryId: category.id,
      status: KbArticleStatus.PUBLISHED,
      visibility,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, excerpt: true },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-(--text-primary)">{category.name}</h1>
      <ul className="mt-6 space-y-2">
        {articles.map((a) => (
          <li key={a.slug}>
            <Link href={`/help/article/${a.slug}`} className="text-(--color-primary) hover:underline">
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
