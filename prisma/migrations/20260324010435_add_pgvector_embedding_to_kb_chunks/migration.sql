-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "KnowledgeBaseChunk" ADD COLUMN "embedding" vector(1536);

-- IVFFlat index for cosine similarity (partial: published chunks only). Prisma cannot model this natively.
CREATE INDEX "KnowledgeBaseChunk_embedding_ivfflat_idx" ON "KnowledgeBaseChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100) WHERE status = 'PUBLISHED'::"KbArticleStatus";
