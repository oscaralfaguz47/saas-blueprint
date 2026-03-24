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
    <article className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-(--text-muted)">
        <a href="/help" className="hover:text-(--text-primary)">
          Help
        </a>{" "}
        /{" "}
        <a href={`/help/category/${article.category.slug}`} className="hover:text-(--text-primary)">
          {article.category.name}
        </a>
      </nav>
      <h1 className="mt-4 text-3xl font-semibold text-(--text-primary)">{article.title}</h1>
      <div className="mt-6">
        <SafeMarkdown markdown={article.bodyMarkdown} />
      </div>
      {!isAuthenticated ? <HelpContactSupportCta signInCallbackUrl={callbackPath} /> : null}
    </article>
  );
}
