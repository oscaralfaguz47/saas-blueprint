import "server-only";

import { KbVisibility } from "@prisma/client";

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
  const q = query.trim();
  if (!q) return q;
  const lower = q.toLowerCase();
  const aliases: string[] = [];

  if (/\bpais(es)?\b/u.test(lower) || /\bcountry\b/u.test(lower)) aliases.push("country");
  if (/\bfactura(s)?\b/u.test(lower) || /\bbilling\b/u.test(lower)) aliases.push("billing");
  if (/\bdireccion\b/u.test(lower) || /\baddress\b/u.test(lower)) aliases.push("address");

  if (aliases.length === 0) return q;
  return `${q} ${Array.from(new Set(aliases)).join(" ")}`.trim();
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
  const threshold = env.KB_SEARCH_SIMILARITY_THRESHOLD ?? 0.65;

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
 * Hybrid retrieval: semantic (pgvector cosine) when embeddings work; otherwise keyword search.
 * Never throws for pgvector / embedding failures — falls back to keyword search.
 */
export async function retrieveKbChunks(params: RetrieveKbChunksParams): Promise<KbChunk[]> {
  const q = buildSearchableQuery(params.query);
  if (q.length < 2) return [];

  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(q);
  } catch {
    queryEmbedding = null;
  }

  if (queryEmbedding?.length) {
    try {
      const semantic = await retrieveKbChunksSemantic(params, queryEmbedding);
      console.log("[kb-retrieval] semantic_results", {
        query: params.query.slice(0, 60),
        chunkCount: semantic.length,
        scores: semantic.map((r) => ({
          articleTitle: r.articleTitle,
          similarity: Number(r.similarity).toFixed(4),
        })),
        threshold: env.KB_SEARCH_SIMILARITY_THRESHOLD,
      });
      if (semantic.length > 0) {
        return applyTokenBudget(semantic, MAX_CONTEXT_TOKENS);
      }
      // If semantic search ran but nothing is relevant enough, try lexical fallback.
      // Fallback itself has a rank threshold and can still return [].
      console.log("[kb-retrieval] fallback_to_keyword", {
        query: params.query.slice(0, 60),
        reason: "semantic returned 0 results above threshold",
      });
      return retrieveKbChunksKeywordSearch(params);
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
    }
  }

  return retrieveKbChunksKeywordSearch(params);
}
