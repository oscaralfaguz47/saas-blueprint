/**
 * Bulk reindex: rebuild KnowledgeBaseChunk rows + embeddings for every published article.
 * Standalone script — does not import `src/server/**` (avoids `server-only` in tsx).
 *
 * Env (from `.env` via `dotenv/config`, then `.env.local` overrides):
 * - DATABASE_URL
 * - OPENAI_API_KEY or AI_API_KEY
 *
 * Usage: pnpm run reindex:kb
 */
import "dotenv/config";
import { resolve } from "node:path";

import { config as loadEnvLocal } from "dotenv";
import { KbArticleStatus, PrismaClient } from "@prisma/client";

/** Prefer local overrides after default `.env` load from `dotenv/config`. */
loadEnvLocal({ path: resolve(process.cwd(), ".env.local"), override: true });

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_MAX_LEN = 1200;
const CHUNK_OVERLAP = 200;
const DELAY_MS = 500;
const EMBED_TIMEOUT_MS = 60_000;

function getDatabaseUrl(): string {
  const u = process.env.DATABASE_URL?.trim();
  if (!u) {
    throw new Error("DATABASE_URL is required");
  }
  return u;
}

function getOpenAiKey(): string {
  const k =
    process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim();
  if (!k) {
    throw new Error("OPENAI_API_KEY or AI_API_KEY is required");
  }
  return k;
}

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
  const overlap = CHUNK_OVERLAP;
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

function formatVectorForSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function normalizeEmbeddingInput(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fetchEmbedding(
  apiKey: string,
  text: string
): Promise<number[]> {
  const input = normalizeEmbeddingInput(text);
  if (!input) {
    throw new Error("EMBEDDING_EMPTY_INPUT");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `OpenAI embeddings HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`
      );
    }
    const json = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const emb = json.data?.[0]?.embedding;
    if (!emb || emb.length !== EMBEDDING_DIMENSIONS) {
      throw new Error("EMBEDDING_BAD_RESPONSE");
    }
    return emb;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function indexArticle(
  prisma: PrismaClient,
  apiKey: string,
  articleId: string
): Promise<void> {
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
    throw new Error("KB_ARTICLE_NOT_FOUND");
  }
  if (article.status !== KbArticleStatus.PUBLISHED) {
    throw new Error("KB_ARTICLE_NOT_PUBLISHED");
  }

  const plain = stripMarkdown(article.bodyMarkdown);
  const titlePrefix = article.title ? `${article.title}. ` : "";
  const fullText = titlePrefix + plain;
  const pieces = splitIntoChunks(fullText, CHUNK_MAX_LEN);

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
      const embedding = await fetchEmbedding(apiKey, plainText);
      const vec = formatVectorForSql(embedding);
      await prisma.$executeRaw`
        UPDATE "KnowledgeBaseChunk"
        SET embedding = ${vec}::vector
        WHERE id = ${chunkId}
      `;
    } catch (e) {
      console.error("[reindex-kb] chunk_embedding_failed", {
        articleId,
        chunkId,
        errorName: e instanceof Error ? e.name : "unknown",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await prisma.knowledgeBaseArticle.update({
    where: { id: articleId },
    data: { lastIndexedAt: new Date() },
  });
}

async function main() {
  getDatabaseUrl();
  const apiKey = getOpenAiKey();

  const prisma = new PrismaClient();

  try {
    const articles = await prisma.knowledgeBaseArticle.findMany({
      where: { status: KbArticleStatus.PUBLISHED },
      select: { id: true, slug: true },
      orderBy: { updatedAt: "asc" },
    });

    console.log("[reindex-kb] starting", { total: articles.length });

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]!;
      try {
        await indexArticle(prisma, apiKey, article.id);
        ok += 1;
        console.log("[reindex-kb] ok", {
          index: i + 1,
          total: articles.length,
          articleId: article.id,
          slug: article.slug,
        });
      } catch (e) {
        failed += 1;
        console.error("[reindex-kb] error", {
          index: i + 1,
          total: articles.length,
          articleId: article.id,
          slug: article.slug,
          errorName: e instanceof Error ? e.name : "unknown",
          errorMessage: e instanceof Error ? e.message : String(e),
        });
      }

      if (i < articles.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    console.log("[reindex-kb] done", { ok, failed, total: articles.length });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[reindex-kb] fatal", {
    errorName: e instanceof Error ? e.name : "unknown",
    errorMessage: e instanceof Error ? e.message : String(e),
  });
  process.exit(1);
});
