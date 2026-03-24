# Knowledge Base semantic search (pgvector)

## Overview

Published KB chunks can store **OpenAI embeddings** (`text-embedding-3-small`, 1536 dimensions) for **semantic retrieval**. The system **hybrid-falls back** to keyword search when embeddings or pgvector are unavailable.

## Local development

Use the **pgvector-enabled** Docker image (see `docker-compose.yml`: `pgvector/pgvector:pg16`). Plain `postgres:16` images do not ship pgvector; semantic search will degrade to keyword-only until you switch images and re-run migrations.

## Staging / production (Neon)

1. Run `CREATE EXTENSION IF NOT EXISTS vector;` once per database — see [NEON_PGVECTOR.md](./NEON_PGVECTOR.md).
2. Deploy migrations (`pnpm prisma migrate deploy`).

## Post-migration: re-index articles

Existing `KnowledgeBaseChunk` rows will have `embedding = null` until re-indexed.

**Required after upgrading:** re-run indexing for published articles so embeddings are generated:

- In the **Knowledge Base CMS**, use **Reindex** on each article (or republish flows that trigger indexing), **or**
- Any server path that calls `indexKbArticle` for each published article.

Until re-indexed, those chunks remain searchable via **keyword** search only (not semantic).

## Environment

- `AI_PROVIDER=openai` and `AI_API_KEY` with **Chat completions** and **Embeddings** API access (see `.env.example` and README).
- Optional: `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` (defaults: `text-embedding-3-small`, `1536`).
