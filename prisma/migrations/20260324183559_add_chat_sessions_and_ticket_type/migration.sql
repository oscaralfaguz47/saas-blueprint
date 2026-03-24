-- CreateEnum
CREATE TYPE "SupportTicketType" AS ENUM ('SUPPORT', 'SALES_INQUIRY');

-- CreateEnum
CREATE TYPE "AiChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_requesterUserId_fkey";

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "requesterEmail" VARCHAR(255),
ADD COLUMN     "ticketType" "SupportTicketType" NOT NULL DEFAULT 'SUPPORT',
ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "createdByUserId" DROP NOT NULL,
ALTER COLUMN "requesterUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AiChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "visitorEmail" VARCHAR(255),
    "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "AiChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citedArticleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiChatSession_userId_idx" ON "AiChatSession"("userId");

-- CreateIndex
CREATE INDEX "AiChatSession_visitorEmail_idx" ON "AiChatSession"("visitorEmail");

-- CreateIndex
CREATE INDEX "AiChatSession_tenantId_idx" ON "AiChatSession"("tenantId");

-- CreateIndex
CREATE INDEX "AiChatSession_startedAt_idx" ON "AiChatSession"("startedAt");

-- CreateIndex
CREATE INDEX "AiChatSession_isAuthenticated_idx" ON "AiChatSession"("isAuthenticated");

-- CreateIndex
CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_ticketType_idx" ON "SupportTicket"("ticketType");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
