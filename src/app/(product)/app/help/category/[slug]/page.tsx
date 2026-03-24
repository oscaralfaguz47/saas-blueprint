import Link from "next/link";
import { notFound } from "next/navigation";
import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { CardContent, CardRoot } from "@/components/ui/card";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const vis = [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED];

const typeLabel: Record<string, string> = {
  FAQ: "FAQ",
  GUIDE: "Guide",
  BILLING: "Billing",
  SECURITY: "Security",
  PRICING: "Pricing",
  TROUBLESHOOTING: "Troubleshooting",
};

type Props = { params: Promise<{ slug: string }> };

export default async function AppHelpCategoryPage({ params }: Props) {
  const { slug } = await params;

  const category = await prisma.knowledgeBaseCategory.findFirst({
    where: { slug, isPublished: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
    },
  });
  if (!category) notFound();

  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: {
      categoryId: category.id,
      status: KbArticleStatus.PUBLISHED,
      visibility: { in: vis },
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
        <Link href="/app/help/inbox" className="hover:text-(--text-primary)">
          Help &amp; Support
        </Link>
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
                <Link href={`/app/help/article/${a.slug}`} className="block">
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
                      <h3 className="mt-2 font-semibold text-(--color-primary) hover:underline">{a.title}</h3>
                      {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-(--text-muted)">{a.excerpt}</p> : null}
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
