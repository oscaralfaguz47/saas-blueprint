import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { CardContent, CardRoot } from "@/components/ui/card";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { kbVisibilityFilterForHelpSurface } from "@/server/knowledge-base/kb-public-visibility";
import { KbArticleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const typeLabel: Record<string, string> = {
  FAQ: "FAQ",
  GUIDE: "Guide",
  BILLING: "Billing",
  SECURITY: "Security",
  PRICING: "Pricing",
  TROUBLESHOOTING: "Troubleshooting",
};

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
    select: { id: true, name: true, slug: true, description: true },
  });
  if (!category) notFound();

  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: {
      categoryId: category.id,
      status: KbArticleStatus.PUBLISHED,
      visibility,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      excerpt: true,
      articleType: true,
      updatedAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-1 pb-10 pt-2 md:px-2">
      <nav aria-label="Breadcrumb" className="text-sm text-(--text-muted)">
        <a href="/help/new" className="hover:text-(--text-primary)">
          Help &amp; Support
        </a>
        <span className="mx-2 text-(--text-muted)">/</span>
        <span className="text-(--text-primary)">{category.name}</span>
      </nav>

      <header className="mt-6">
        <h1 className="text-3xl font-semibold text-(--text-primary)">{category.name}</h1>
        {category.description ? (
          <p className="mt-2 max-w-3xl text-(--text-muted)">{category.description}</p>
        ) : null}
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-(--text-primary)">Articles</h2>
        {articles.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-10 text-center text-sm text-(--text-muted)">
            No articles in this category yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link href={`/help/article/${a.slug}`} className="block">
                  <CardRoot className="transition hover:border-(--color-primary-soft)/60">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 py-0.5 text-xs font-medium text-(--text-secondary)">
                          {typeLabel[a.articleType] ?? a.articleType}
                        </span>
                        <span className="text-xs text-(--text-muted)">
                          Updated {a.updatedAt.toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold text-(--color-primary) hover:underline">
                        {a.title}
                      </h3>
                      {a.excerpt ? (
                        <p className="mt-1 line-clamp-2 text-sm text-(--text-muted)">{a.excerpt}</p>
                      ) : null}
                    </CardContent>
                  </CardRoot>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
