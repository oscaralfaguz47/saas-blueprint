-- AlterTable
ALTER TABLE "RecordAccess" ADD COLUMN "isViewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecordAccess" ADD COLUMN "viewedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "RecordAccess_tenantId_userId_isViewed_idx" ON "RecordAccess"("tenantId", "userId", "isViewed");
