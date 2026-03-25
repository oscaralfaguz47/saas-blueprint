-- Drop the existing IVFFlat index on embedding
DROP INDEX IF EXISTS "KnowledgeBaseChunk_embedding_ivfflat_idx";

-- HNSW index for cosine similarity (partial: published chunks only).
-- Requires pgvector >= 0.5.0. Verify: SELECT extversion FROM pg_extension WHERE extname = 'vector';
CREATE INDEX "KnowledgeBaseChunk_embedding_hnsw_idx"
  ON "KnowledgeBaseChunk"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE status = 'PUBLISHED'::"KbArticleStatus";

-- Partial composite for the common retrieval filter (published rows only)
DROP INDEX IF EXISTS "KnowledgeBaseChunk_status_visibility_idx";
CREATE INDEX "KnowledgeBaseChunk_status_visibility_idx"
  ON "KnowledgeBaseChunk" ("status", "visibility")
  WHERE status = 'PUBLISHED'::"KbArticleStatus";
