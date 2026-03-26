import Link from "next/link";
import { notFound } from "next/navigation";
import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { HelpArticleFeedback } from "@/components/app/help/help-article-feedback";
import { SafeMarkdown } from "@/components/markdown/safe-markdown";
import { Badge } from "@/components/ui/badge";
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

export default async function AppHelpArticlePage({ params }: Props) {
  const { slug } = await params;

  const article = await prisma.knowledgeBaseArticle.findFirst({
    where: {
      slug,
      status: KbArticleStatus.PUBLISHED,
      visibility: { in: vis },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      bodyMarkdown: true,
      articleType: true,
      visibility: true,
      publishedAt: true,
      updatedAt: true,
      categoryId: true,
      category: { select: { name: true, slug: true } },
    },
  });
  if (!article) notFound();

  const related = await prisma.knowledgeBaseArticle.findMany({
    where: {
      categoryId: article.categoryId,
      id: { not: article.id },
      status: KbArticleStatus.PUBLISHED,
      visibility: { in: vis },
    },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { slug: true, title: true, excerpt: true },
  });

  const dateLabel = (article.publishedAt ?? article.updatedAt).toLocaleDateString();

  return (
    <article className="mx-auto max-w-3xl px-1 pb-12 pt-2 md:px-2">
      <nav aria-label="Breadcrumb" className="text-sm text-(--text-muted)">
        <Link href="/app/help/inbox" className="hover:text-(--text-primary)">
          Help &amp; Support
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/app/help/category/${article.category.slug}`} className="hover:text-(--text-primary)">
          {article.category.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-(--text-primary)">{article.title}</span>
      </nav>

      <header className="mt-6 border-b border-(--border-subtle) pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{article.category.name}</Badge>
          <Badge variant="default">{typeLabel[article.articleType] ?? article.articleType}</Badge>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-(--text-primary)">{article.title}</h1>
        <p className="mt-2 text-sm text-(--text-muted)">Published {dateLabel}</p>
      </header>

      <div className="prose-article mt-8">
        <SafeMarkdown
          markdown={article.bodyMarkdown}
          className="prose prose-sm max-w-none text-(--text-primary) [&_blockquote]:border-l-(--color-primary-soft) [&_blockquote]:text-(--text-secondary) [&_code]:rounded [&_code]:bg-(--bg-surface-elev) [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-(--border-subtle) [&_pre]:bg-(--bg-surface-elev) [&_ul]:list-disc [&_a]:text-(--color-primary)"
        />
      </div>

      <HelpArticleFeedback slug={article.slug} />

      <div className="mt-10 rounded-xl border border-(--border-subtle) bg-[color-mix(in_srgb,var(--bg-surface-elev)_40%,transparent)] px-4 py-5">
        <p className="text-sm font-medium text-(--text-primary)">Still need help?</p>
        <p className="mt-1 text-sm text-(--text-muted)">Our support team can assist with your workspace.</p>
        <Link
          href="/app/help/new"
          className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm hover:bg-(--color-primary-hover)"
        >
          Contact our support team
        </Link>
      </div>

      {related.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-(--text-primary)">Related articles</h2>
          <ul className="mt-4 space-y-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/app/help/article/${r.slug}`} className="block">
                  <CardRoot className="transition hover:border-(--color-primary-soft)/60">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-(--color-primary) hover:underline">{r.title}</h3>
                      {r.excerpt ? (
                        <p className="mt-1 line-clamp-2 text-sm text-(--text-muted)">{r.excerpt}</p>
                      ) : null}
                    </CardContent>
                  </CardRoot>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
