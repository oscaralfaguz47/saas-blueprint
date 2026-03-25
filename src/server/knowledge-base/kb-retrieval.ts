import "server-only";

import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { generateEmbedding } from "@/server/ai/ai-provider";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";

import { formatVectorForSql } from "./kb-vector-sql";

export type KbChunk = {
  id: string;
  articleId: string;
  chunkIndex: number;
  plainText: string;
  articleTitle: string;
  articleSlug: string;
};

export type RetrieveKbChunksParams = {
  query: string;
  isAuthenticated: boolean;
  /** Max chunks to return (bounded). */
  limit: number;
};

/** ~3000 tokens — approximate with tokenCount or chars/4. */
const MAX_CONTEXT_TOKENS = 3000;

function buildSearchableQuery(query: string): string {
  return query.trim();
}

type SemanticRow = {
  id: string;
  articleId: string;
  chunkIndex: number;
  plainText: string;
  tokenCount: number | null;
  articleTitle: string;
  articleSlug: string;
  similarity: number;
};

type KeywordRow = {
  id: string;
  articleId: string;
  chunkIndex: number;
  plainText: string;
  tokenCount: number | null;
  articleTitle: string;
  articleSlug: string;
  rank: number;
};

function estimateTokens(plainText: string, tokenCount: number | null): number {
  if (tokenCount != null && tokenCount > 0) return tokenCount;
  return Math.ceil(plainText.length / 4);
}

async function retrieveChunksByTitleMatch(
  params: RetrieveKbChunksParams
): Promise<KbChunk[]> {
  const q = params.query.trim();
  if (q.length < 3) return [];

  const visibilityFilter = params.isAuthenticated
    ? { in: [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED] }
    : KbVisibility.PUBLIC;

  const rawTerms = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((w) => w.length >= 4);
  const terms = Array.from(new Set(rawTerms)).slice(0, 8);
  const titleFilter =
    terms.length > 0
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            ...terms.map((t) => ({
              title: { contains: t, mode: "insensitive" as const },
            })),
          ],
        }
      : { title: { contains: q, mode: "insensitive" as const } };

  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: {
      status: KbArticleStatus.PUBLISHED,
      visibility: visibilityFilter,
      ...titleFilter,
    },
    select: { id: true, title: true, slug: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });

  if (articles.length === 0) return [];

  const articleIds = articles.map((a) => a.id);
  const chunks = await prisma.knowledgeBaseChunk.findMany({
    where: {
      articleId: { in: articleIds },
      status: KbArticleStatus.PUBLISHED,
      visibility: visibilityFilter,
    },
    orderBy: [{ articleId: "asc" }, { chunkIndex: "asc" }],
    take: 6,
    select: {
      id: true,
      articleId: true,
      chunkIndex: true,
      plainText: true,
      tokenCount: true,
    },
  });

  const articleMap = new Map(articles.map((a) => [a.id, a]));

  return chunks.map((c) => ({
    id: c.id,
    articleId: c.articleId,
    chunkIndex: c.chunkIndex,
    plainText: c.plainText,
    articleTitle: articleMap.get(c.articleId)?.title ?? "",
    articleSlug: articleMap.get(c.articleId)?.slug ?? "",
  }));
}

function applyTokenBudget(rows: SemanticRow[], maxTokens: number): KbChunk[] {
  const out: KbChunk[] = [];
  let used = 0;
  for (const r of rows) {
    const t = estimateTokens(r.plainText, r.tokenCount);
    if (out.length > 0 && used + t > maxTokens) break;
    out.push({
      id: r.id,
      articleId: r.articleId,
      chunkIndex: r.chunkIndex,
      plainText: r.plainText,
      articleTitle: r.articleTitle,
      articleSlug: r.articleSlug,
    });
    used += t;
  }
  return out;
}

/**
 * Keyword-only retrieval (AND-of-token matches on plainText). Exported for tests.
 */
export async function retrieveKbChunksKeywordSearch(
  params: RetrieveKbChunksParams
): Promise<KbChunk[]> {
  const q = buildSearchableQuery(params.query);
  if (q.length < 2) return [];

  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((w) => w.length >= 2)
    .slice(0, 12);
  if (words.length === 0) return [];

  const stopWords = new Set([
    "a",
    "an",
    "the",
    "to",
    "i",
    "my",
    "how",
    "do",
    "can",
    "update",
    "info",
    "cambiar",
    "como",
    "puedo",
    "mi",
    "mis",
    "de",
    "la",
    "el",
    "por",
    "uno",
    "una",
    "que",
  ]);
  const filteredWords = words.filter((w) => !stopWords.has(w.toLowerCase()));
  const baseWords = Array.from(new Set(filteredWords.length > 0 ? filteredWords : words));
  const translatedWords = Array.from(
    new Set(
      baseWords.map((w) => {
        const lw = w.toLowerCase();
        if (lw === "pais" || lw === "paises") return "country";
        if (lw === "factura" || lw === "facturas") return "billing";
        if (lw === "direccion") return "address";
        return lw;
      })
    )
  );

  const originalAnd = baseWords
    .map((w) => w.replace(/[':|&!()]/g, ""))
    .filter(Boolean)
    .join(" & ");
  const translatedAnd = translatedWords
    .map((w) => w.replace(/[':|&!()]/g, ""))
    .filter(Boolean)
    .join(" & ");

  const tsQuery =
    translatedAnd && translatedAnd !== originalAnd
      ? `(${originalAnd}) | (${translatedAnd})`
      : originalAnd;
  if (!tsQuery) return [];

  const rankThreshold = 0.02;
  const fetchLimit = Math.min(Math.max(params.limit * 3, 12), 60);

  const rows = params.isAuthenticated
    ? await prisma.$queryRaw<KeywordRow[]>`
      SELECT
        c.id,
        c."articleId",
        c."chunkIndex",
        c."plainText",
        c."tokenCount",
        a.title AS "articleTitle",
        a.slug AS "articleSlug",
        ts_rank(
          to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(c."plainText", '')),
          to_tsquery('simple', ${tsQuery})
        ) AS rank
      FROM "KnowledgeBaseChunk" c
      INNER JOIN "KnowledgeBaseArticle" a ON a.id = c."articleId"
      WHERE
        c.status = 'PUBLISHED'::"KbArticleStatus"
        AND c.visibility IN ('PUBLIC'::"KbVisibility", 'AUTHENTICATED'::"KbVisibility")
        AND to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(c."plainText", ''))
            @@ to_tsquery('simple', ${tsQuery})
      ORDER BY rank DESC, c."updatedAt" DESC
      LIMIT ${fetchLimit}
    `
    : await prisma.$queryRaw<KeywordRow[]>`
      SELECT
        c.id,
        c."articleId",
        c."chunkIndex",
        c."plainText",
        c."tokenCount",
        a.title AS "articleTitle",
        a.slug AS "articleSlug",
        ts_rank(
          to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(c."plainText", '')),
          to_tsquery('simple', ${tsQuery})
        ) AS rank
      FROM "KnowledgeBaseChunk" c
      INNER JOIN "KnowledgeBaseArticle" a ON a.id = c."articleId"
      WHERE
        c.status = 'PUBLISHED'::"KbArticleStatus"
        AND c.visibility = 'PUBLIC'::"KbVisibility"
        AND to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(c."plainText", ''))
            @@ to_tsquery('simple', ${tsQuery})
      ORDER BY rank DESC, c."updatedAt" DESC
      LIMIT ${fetchLimit}
    `;

  const ranked = rows
    .filter((r) => Number(r.rank) >= rankThreshold)
    .sort((a, b) => Number(b.rank) - Number(a.rank));

  console.log("[kb-retrieval] keyword_results", {
    query: params.query.slice(0, 60),
    tsQuery,
    chunkCount: ranked.length,
    titles: ranked.slice(0, 3).map((r) => r.articleTitle),
  });

  return applyTokenBudget(
    ranked.map((r) => ({
      id: r.id,
      articleId: r.articleId,
      chunkIndex: r.chunkIndex,
      plainText: r.plainText,
      tokenCount: r.tokenCount,
      articleTitle: r.articleTitle,
      articleSlug: r.articleSlug,
      similarity: 0,
    })),
    MAX_CONTEXT_TOKENS
  );
}

async function retrieveKbChunksSemantic(
  params: RetrieveKbChunksParams,
  queryEmbedding: number[]
): Promise<SemanticRow[]> {
  const vec = formatVectorForSql(queryEmbedding);
  const fetchLimit = Math.min(48, Math.max(params.limit * 3, params.limit, 12));
  const threshold = env.KB_SEARCH_SIMILARITY_THRESHOLD ?? 0.40;

  if (params.isAuthenticated) {
    return prisma.$queryRaw<SemanticRow[]>`
      SELECT
        c.id,
        c."articleId",
        c."chunkIndex",
        c."plainText",
        c."tokenCount",
        a.title AS "articleTitle",
        a.slug AS "articleSlug",
        1 - (c.embedding <=> ${vec}::vector) AS similarity
      FROM "KnowledgeBaseChunk" c
      INNER JOIN "KnowledgeBaseArticle" a ON a.id = c."articleId"
      WHERE
        c.status = 'PUBLISHED'::"KbArticleStatus"
        AND c.visibility IN ('PUBLIC'::"KbVisibility", 'AUTHENTICATED'::"KbVisibility")
        AND c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> ${vec}::vector) >= ${threshold}
      ORDER BY c.embedding <=> ${vec}::vector
      LIMIT ${fetchLimit}
    `;
  }

  return prisma.$queryRaw<SemanticRow[]>`
    SELECT
      c.id,
      c."articleId",
      c."chunkIndex",
      c."plainText",
      c."tokenCount",
      a.title AS "articleTitle",
      a.slug AS "articleSlug",
      1 - (c.embedding <=> ${vec}::vector) AS similarity
    FROM "KnowledgeBaseChunk" c
    INNER JOIN "KnowledgeBaseArticle" a ON a.id = c."articleId"
    WHERE
      c.status = 'PUBLISHED'::"KbArticleStatus"
      AND c.visibility = 'PUBLIC'::"KbVisibility"
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> ${vec}::vector) >= ${threshold}
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${fetchLimit}
  `;
}

function isPgVectorLikelyError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("vector") ||
    msg.includes("extension") ||
    msg.includes("operator does not exist") ||
    msg.includes("ivfflat")
  );
}

/**
 * Hybrid retrieval: title match first, then semantic (pgvector cosine) or keyword search.
 * Never throws for pgvector / embedding failures — falls back to keyword search.
 */
export async function retrieveKbChunks(params: RetrieveKbChunksParams): Promise<KbChunk[]> {
  const q = buildSearchableQuery(params.query);
  if (q.length < 2) return [];

  const titleMatches = await retrieveChunksByTitleMatch(params);

  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(q);
  } catch {
    queryEmbedding = null;
  }

  let bodyChunks: KbChunk[] = [];

  if (queryEmbedding?.length) {
    try {
      const semantic = await retrieveKbChunksSemantic(params, queryEmbedding);
      console.log("[kb-retrieval] semantic_results", {
        model: env.EMBEDDING_MODEL ?? "text-embedding-3-large",
        query: params.query.slice(0, 60),
        chunkCount: semantic.length,
        scores: semantic.map((r) => ({
          articleTitle: r.articleTitle,
          similarity: Number(r.similarity).toFixed(4),
        })),
        threshold: env.KB_SEARCH_SIMILARITY_THRESHOLD,
      });
      if (semantic.length > 0) {
        bodyChunks = applyTokenBudget(semantic, MAX_CONTEXT_TOKENS);
      } else {
        console.log("[kb-retrieval] fallback_to_keyword", {
          query: params.query.slice(0, 60),
          reason: "semantic returned 0 results above threshold",
        });
        bodyChunks = await retrieveKbChunksKeywordSearch(params);
      }
    } catch (e) {
      if (isPgVectorLikelyError(e)) {
        console.warn("[kb-retrieval] semantic_search_unavailable", {
          reason: e instanceof Error ? e.name : "unknown",
        });
      } else {
        console.warn("[kb-retrieval] semantic_search_failed", {
          reason: e instanceof Error ? e.name : "unknown",
        });
      }
      bodyChunks = await retrieveKbChunksKeywordSearch(params);
    }
  } else {
    bodyChunks = await retrieveKbChunksKeywordSearch(params);
  }

  const seen = new Set<string>();
  const merged: KbChunk[] = [];
  for (const c of [...titleMatches, ...bodyChunks]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      merged.push(c);
    }
  }

  return applyTokenBudget(
    merged.map((c) => ({
      id: c.id,
      articleId: c.articleId,
      chunkIndex: c.chunkIndex,
      plainText: c.plainText,
      tokenCount: null,
      articleTitle: c.articleTitle,
      articleSlug: c.articleSlug,
      similarity: 0,
    })),
    MAX_CONTEXT_TOKENS
  );
}
