-- AlterTable
ALTER TABLE "AccountLinkIntent" ADD COLUMN "errorCode" VARCHAR(50);

-- CreateIndex
CREATE INDEX "AccountLinkIntent_consumedAt_idx" ON "AccountLinkIntent"("consumedAt");
