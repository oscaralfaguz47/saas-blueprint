-- CreateEnum
CREATE TYPE "KbArticleType" AS ENUM ('FAQ', 'GUIDE', 'BILLING', 'SECURITY', 'PRICING', 'TROUBLESHOOTING');

-- CreateEnum
CREATE TYPE "KbVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "KbArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KbSearchMode" AS ENUM ('KEYWORD', 'AI');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SupportMessageAuthorKind" AS ENUM ('WORKSPACE_USER', 'PLATFORM_ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "KnowledgeBaseCategory" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "description" VARCHAR(1000),
    "icon" VARCHAR(80),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeBaseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseTag" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBaseTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseArticle" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "excerpt" VARCHAR(500),
    "bodyMarkdown" TEXT NOT NULL,
    "articleType" "KbArticleType" NOT NULL,
    "visibility" "KbVisibility" NOT NULL,
    "status" "KbArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeBaseArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseArticleRevision" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "excerpt" VARCHAR(500),
    "bodyMarkdown" TEXT NOT NULL,
    "articleType" "KbArticleType" NOT NULL,
    "visibility" "KbVisibility" NOT NULL,
    "status" "KbArticleStatus" NOT NULL,
    "snapshotReason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeBaseArticleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseArticleTag" (
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeBaseArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseChunk" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "revisionId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "plainText" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "visibility" "KbVisibility" NOT NULL,
    "status" "KbArticleStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBaseChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseSearchLog" (
    "id" TEXT NOT NULL,
    "queryTextRedactedOrTruncated" VARCHAR(500) NOT NULL,
    "queryHash" VARCHAR(64),
    "searchMode" "KbSearchMode" NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "topArticleId" TEXT,
    "wasHelpful" BOOLEAN,
    "isAuthenticated" BOOLEAN NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBaseSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "descriptionPreview" VARCHAR(500),
    "topicCategoryId" TEXT,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneePlatformUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorKind" "SupportMessageAuthorKind" NOT NULL,
    "bodyText" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "jobType" VARCHAR(80) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "tenantId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseCategory_slug_key" ON "KnowledgeBaseCategory"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeBaseCategory_isPublished_idx" ON "KnowledgeBaseCategory"("isPublished");

-- CreateIndex
CREATE INDEX "KnowledgeBaseCategory_sortOrder_idx" ON "KnowledgeBaseCategory"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseTag_name_key" ON "KnowledgeBaseTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseTag_slug_key" ON "KnowledgeBaseTag"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeBaseTag_slug_idx" ON "KnowledgeBaseTag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseArticle_slug_key" ON "KnowledgeBaseArticle"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_status_idx" ON "KnowledgeBaseArticle"("status");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_visibility_idx" ON "KnowledgeBaseArticle"("visibility");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_categoryId_idx" ON "KnowledgeBaseArticle"("categoryId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_publishedAt_idx" ON "KnowledgeBaseArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_updatedAt_idx" ON "KnowledgeBaseArticle"("updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_status_visibility_publishedAt_idx" ON "KnowledgeBaseArticle"("status", "visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_isFeatured_idx" ON "KnowledgeBaseArticle"("isFeatured");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticleRevision_articleId_idx" ON "KnowledgeBaseArticleRevision"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticleRevision_createdAt_idx" ON "KnowledgeBaseArticleRevision"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticleTag_tagId_idx" ON "KnowledgeBaseArticleTag"("tagId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_articleId_idx" ON "KnowledgeBaseChunk"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_status_idx" ON "KnowledgeBaseChunk"("status");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_visibility_idx" ON "KnowledgeBaseChunk"("visibility");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_status_visibility_idx" ON "KnowledgeBaseChunk"("status", "visibility");

-- CreateIndex
CREATE INDEX "KnowledgeBaseSearchLog_createdAt_idx" ON "KnowledgeBaseSearchLog"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseSearchLog_searchMode_idx" ON "KnowledgeBaseSearchLog"("searchMode");

-- CreateIndex
CREATE INDEX "KnowledgeBaseSearchLog_tenantId_idx" ON "KnowledgeBaseSearchLog"("tenantId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseSearchLog_queryHash_idx" ON "KnowledgeBaseSearchLog"("queryHash");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_status_createdAt_idx" ON "SupportTicket"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_requesterUserId_idx" ON "SupportTicket"("requesterUserId");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneePlatformUserId_idx" ON "SupportTicket"("assigneePlatformUserId");

-- CreateIndex
CREATE INDEX "SupportTicket_lastMessageAt_idx" ON "SupportTicket"("lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_isInternal_idx" ON "SupportTicketMessage"("isInternal");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_idempotencyKey_key" ON "BackgroundJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_scheduledFor_idx" ON "BackgroundJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "BackgroundJob_tenantId_idx" ON "BackgroundJob"("tenantId");

-- CreateIndex
CREATE INDEX "BackgroundJob_jobType_idx" ON "BackgroundJob"("jobType");

-- AddForeignKey
ALTER TABLE "KnowledgeBaseCategory" ADD CONSTRAINT "KnowledgeBaseCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseCategory" ADD CONSTRAINT "KnowledgeBaseCategory_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticle" ADD CONSTRAINT "KnowledgeBaseArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeBaseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticle" ADD CONSTRAINT "KnowledgeBaseArticle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticle" ADD CONSTRAINT "KnowledgeBaseArticle_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticleRevision" ADD CONSTRAINT "KnowledgeBaseArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeBaseArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticleRevision" ADD CONSTRAINT "KnowledgeBaseArticleRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticleTag" ADD CONSTRAINT "KnowledgeBaseArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeBaseArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseArticleTag" ADD CONSTRAINT "KnowledgeBaseArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "KnowledgeBaseTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseChunk" ADD CONSTRAINT "KnowledgeBaseChunk_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeBaseArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseChunk" ADD CONSTRAINT "KnowledgeBaseChunk_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "KnowledgeBaseArticleRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseSearchLog" ADD CONSTRAINT "KnowledgeBaseSearchLog_topArticleId_fkey" FOREIGN KEY ("topArticleId") REFERENCES "KnowledgeBaseArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseSearchLog" ADD CONSTRAINT "KnowledgeBaseSearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseSearchLog" ADD CONSTRAINT "KnowledgeBaseSearchLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneePlatformUserId_fkey" FOREIGN KEY ("assigneePlatformUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_topicCategoryId_fkey" FOREIGN KEY ("topicCategoryId") REFERENCES "KnowledgeBaseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
