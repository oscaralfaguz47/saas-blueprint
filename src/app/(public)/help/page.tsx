import Link from "next/link";
import { getServerSession } from "next-auth";

import { OpenChatWidgetTrigger } from "@/components/help/open-chat-widget-trigger";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { kbVisibilityFilterForHelpSurface } from "@/server/knowledge-base/kb-public-visibility";
import { KbArticleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function PublicHelpHomePage() {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.id;
  const visibility = kbVisibilityFilterForHelpSurface(isAuthenticated);

  const [categories, articles] = await Promise.all([
    prisma.knowledgeBaseCategory.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 12,
      select: { slug: true, name: true },
    }),
    prisma.knowledgeBaseArticle.findMany({
      where: {
        status: KbArticleStatus.PUBLISHED,
        visibility,
        isFeatured: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { slug: true, title: true, excerpt: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
      {/* Hero */}
      <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) px-6 py-10 text-center shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-(--text-primary) sm:text-4xl">
          How can we help you?
        </h1>
        <p className="mt-3 text-base text-(--text-muted)">
          Search our knowledge base or ask our AI assistant for instant answers.
        </p>
        <div className="mt-6 flex justify-center">
          <OpenChatWidgetTrigger className="inline-flex h-11 items-center gap-2 rounded-xl bg-(--color-primary) px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--color-primary-hover)">
            Ask AI Assistant
          </OpenChatWidgetTrigger>
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
            Browse by category
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/help/category/${c.slug}`}
                  className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3.5 text-sm font-medium text-(--text-primary) shadow-sm transition-colors hover:border-(--color-primary-soft) hover:bg-(--bg-surface-elev)"
                >
                  <span>{c.name}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-(--text-muted)"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Featured articles */}
      {articles.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
            Featured articles
          </h2>
          <ul className="mt-4 divide-y divide-(--border-subtle) overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-sm">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/help/article/${a.slug}`}
                  className="flex flex-col gap-0.5 px-4 py-3.5 transition-colors hover:bg-(--bg-surface-elev)"
                >
                  <span className="text-sm font-medium text-(--color-primary)">{a.title}</span>
                  {a.excerpt ? (
                    <span className="line-clamp-1 text-xs text-(--text-muted)">{a.excerpt}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Footer CTA for anonymous users */}
      {!isAuthenticated ? (
        <div className="mt-10 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-6 py-5 text-center shadow-sm">
          <p className="text-sm text-(--text-muted)">
            Need personalized help?{" "}
            <Link href="/auth/sign-in" className="font-medium text-(--color-primary) hover:underline">
              Sign in
            </Link>{" "}
            to create a support request.
          </p>
        </div>
      ) : null}
    </div>
  );
}
