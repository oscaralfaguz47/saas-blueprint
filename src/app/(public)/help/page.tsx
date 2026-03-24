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
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-(--text-primary)">Help Center</h1>
      <p className="mt-2 text-(--text-muted)">
        Browse articles or ask our AI assistant using the chat bubble or the button below.
      </p>
      <div className="mt-8 flex max-w-xl">
        <OpenChatWidgetTrigger className="rounded-md bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover)">
          Ask AI
        </OpenChatWidgetTrigger>
      </div>
      {categories.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Categories</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/help/category/${c.slug}`}
                  className="block rounded-lg border border-(--border-subtle) p-3 text-sm font-medium hover:border-(--color-primary-soft)"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {articles.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Featured</h2>
          <ul className="mt-3 space-y-2">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link href={`/help/article/${a.slug}`} className="text-(--color-primary) hover:underline">
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
