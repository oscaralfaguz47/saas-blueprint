-- AlterTable
ALTER TABLE "BillingEvent" ADD COLUMN     "processError" VARCHAR(500),
ADD COLUMN     "processStatus" VARCHAR(20),
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BillingEvent_processStatus_createdAt_idx" ON "BillingEvent"("processStatus", "createdAt");
