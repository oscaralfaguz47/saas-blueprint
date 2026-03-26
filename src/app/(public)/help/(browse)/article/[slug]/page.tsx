import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { HelpContactSupportCta } from "@/components/help/help-contact-support-cta";
import { SafeMarkdown } from "@/components/markdown/safe-markdown";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { kbVisibilityFilterForHelpSurface } from "@/server/knowledge-base/kb-public-visibility";
import { KbArticleStatus } from "@prisma/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await prisma.knowledgeBaseArticle.findFirst({
    where: {
      slug,
      status: KbArticleStatus.PUBLISHED,
      visibility: kbVisibilityFilterForHelpSurface(false),
    },
    select: { title: true, excerpt: true },
  });
  if (!article) {
    return { title: "Not found" };
  }
  const base = env.NEXT_PUBLIC_APP_URL ?? env.NEXTAUTH_URL ?? "";
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    alternates: base ? { canonical: `${base.replace(/\/+$/, "")}/help/article/${slug}` } : undefined,
  };
}

export default async function PublicHelpArticlePage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;
  const visibility = kbVisibilityFilterForHelpSurface(isAuthenticated);

  const { slug } = await params;

  const article = await prisma.knowledgeBaseArticle.findFirst({
    where: {
      slug,
      status: KbArticleStatus.PUBLISHED,
      visibility,
    },
    include: { category: { select: { name: true, slug: true } } },
  });
  if (!article) notFound();

  const callbackPath = `/help/article/${slug}`;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 md:py-14">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-(--text-muted)">
        <a href="/help" className="transition-colors hover:text-(--text-primary)">
          Help & Support
        </a>
        <span>/</span>
        <a
          href={`/help/category/${article.category.slug}`}
          className="transition-colors hover:text-(--text-primary)"
        >
          {article.category.name}
        </a>
        <span>/</span>
        <span className="max-w-[200px] truncate font-medium text-(--text-primary)">{article.title}</span>
      </nav>

      {/* Article header */}
      <div className="mt-6 rounded-2xl border border-(--border-subtle) bg-(--bg-surface) px-6 py-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) sm:text-3xl">
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="mt-3 text-base leading-relaxed text-(--text-muted)">{article.excerpt}</p>
        ) : null}
        <p className="mt-4 text-xs text-(--text-muted)">
          Published{" "}
          {new Date(article.publishedAt ?? article.updatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Article body */}
      <div className="prose prose-sm mt-6 max-w-none rounded-2xl border border-(--border-subtle) bg-(--bg-surface) px-6 py-8 text-(--text-primary) shadow-sm">
        <SafeMarkdown markdown={article.bodyMarkdown} />
      </div>

      {/* Contact CTA for anonymous */}
      {!isAuthenticated ? <HelpContactSupportCta signInCallbackUrl={callbackPath} /> : null}
    </article>
  );
}
