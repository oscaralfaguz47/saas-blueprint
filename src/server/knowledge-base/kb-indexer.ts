import "server-only";

import { KbArticleStatus } from "@prisma/client";

import { generateEmbedding } from "@/server/ai/ai-provider";
import { prisma } from "@/server/db";

import { formatVectorForSql } from "./kb-vector-sql";

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  if (!text) return [];
  const overlap = 200;
  const step = maxLen - overlap;
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const slice = text.slice(i, i + maxLen).trim();
    if (slice) out.push(slice);
    if (i + maxLen >= text.length) break;
    i += step;
  }
  return out.filter(Boolean);
}

async function setChunkEmbedding(chunkId: string, embedding: number[]): Promise<void> {
  const vec = formatVectorForSql(embedding);
  await prisma.$executeRaw`
    UPDATE "KnowledgeBaseChunk"
    SET embedding = ${vec}::vector
    WHERE id = ${chunkId}
  `;
}

/**
 * Rebuilds chunks for a published article. Idempotent — deletes existing chunks first.
 * Embeddings are best-effort: failures leave `embedding` null; keyword search still works.
 */
export async function indexKbArticle(articleId: string): Promise<void> {
  const article = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      status: true,
      title: true,
      bodyMarkdown: true,
      visibility: true,
    },
  });

  if (!article) {
    const err = new Error("KB_ARTICLE_NOT_FOUND");
    err.name = "KbIndexerError";
    throw err;
  }
  if (article.status !== KbArticleStatus.PUBLISHED) {
    const err = new Error("KB_ARTICLE_NOT_PUBLISHED");
    err.name = "KbIndexerError";
    throw err;
  }

  const plain = stripMarkdown(article.bodyMarkdown);
  const titlePrefix = article.title ? `${article.title}. ` : "";
  const fullText = titlePrefix + plain;
  const pieces = splitIntoChunks(fullText, 1200);

  const created: { id: string; plainText: string }[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeBaseChunk.deleteMany({ where: { articleId } });
    let idx = 0;
    for (const text of pieces) {
      const row = await tx.knowledgeBaseChunk.create({
        data: {
          articleId,
          revisionId: null,
          chunkIndex: idx++,
          plainText: text,
          tokenCount: Math.ceil(text.length / 4),
          visibility: article.visibility,
          status: article.status,
        },
        select: { id: true, plainText: true },
      });
      created.push({ id: row.id, plainText: row.plainText });
    }
  });

  for (const { id: chunkId, plainText } of created) {
    try {
      const embedding = await generateEmbedding(plainText);
      try {
        await setChunkEmbedding(chunkId, embedding);
      } catch (e) {
        console.error("[kb-indexer] chunk_embedding_store_failed", {
          chunkId,
          errorName: e instanceof Error ? e.name : "unknown",
        });
      }
    } catch (e) {
      console.error("[kb-indexer] chunk_embedding_failed", {
        chunkId,
        errorName: e instanceof Error ? e.name : "unknown",
      });
    }
  }

  await prisma.knowledgeBaseArticle.update({
    where: { id: articleId },
    data: { lastIndexedAt: new Date() },
  });
}

/** Removes search chunks and clears lastIndexedAt (e.g. on unpublish). */
export async function clearKbArticleChunks(articleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeBaseChunk.deleteMany({ where: { articleId } });
    await tx.knowledgeBaseArticle.update({
      where: { id: articleId },
      data: { lastIndexedAt: null },
    });
  });
}
