import "server-only";

import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { generateSlug } from "@/lib/slug";
import { prisma } from "@/server/db";

/**
 * Replace article tags from display names. Upserts tags; links article.
 */
export async function syncKnowledgeBaseArticleTags(
  articleId: string,
  tagNames: string[],
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx ?? prisma;
  const normalized = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))];

  await db.knowledgeBaseArticleTag.deleteMany({ where: { articleId } });

  for (const rawName of normalized) {
    const name = rawName.slice(0, 120);
    let tag = await db.knowledgeBaseTag.findUnique({
      where: { name },
      select: { id: true },
    });
    if (!tag) {
      let baseSlug = generateSlug(name);
      for (let i = 0; i < 50; i++) {
        const slug = i === 0 ? baseSlug : `${baseSlug}-${i}`;
        try {
          tag = await db.knowledgeBaseTag.create({
            data: { name, slug },
            select: { id: true },
          });
          break;
        } catch (e: unknown) {
          if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
            continue;
          }
          throw e;
        }
      }
    }
    if (!tag) {
      throw new Error("TAG_CREATE_FAILED");
    }
    await db.knowledgeBaseArticleTag.create({
      data: { articleId, tagId: tag.id },
    });
  }
}
