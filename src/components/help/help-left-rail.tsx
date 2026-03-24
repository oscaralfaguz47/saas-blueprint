import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { prisma } from "@/server/db";

import { HelpLeftRailClient } from "./help-left-rail-client";

export type HelpLeftRailProps = {
  /** Public KB uses `/help`; authenticated app uses `/app/help`. */
  basePath: "/help" | "/app/help";
  /** When true, show Inbox and New request (same paths under `basePath`). */
  showAuthLinks: boolean;
  /** When true, only PUBLIC articles appear under categories (public `/help` surface). */
  isPublicSurface: boolean;
};

export async function HelpLeftRail({ basePath, showAuthLinks, isPublicSurface }: HelpLeftRailProps) {
  const categories = await prisma.knowledgeBaseCategory.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      articles: {
        where: {
          status: KbArticleStatus.PUBLISHED,
          visibility: isPublicSurface
            ? KbVisibility.PUBLIC
            : { in: [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED] },
        },
        orderBy: { sortOrder: "asc" },
        select: { slug: true, title: true },
      },
    },
  });

  return (
    <HelpLeftRailClient
      basePath={basePath}
      showAuthLinks={showAuthLinks}
      showPublicGetInTouch={basePath === "/help"}
      categories={categories}
    />
  );
}
