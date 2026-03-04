-- AlterTable
ALTER TABLE "BillingTransaction" ADD COLUMN     "revisedAt" TIMESTAMP(3),
ADD COLUMN     "revisedByUserId" VARCHAR(191),
ADD COLUMN     "revisionRequestPayload" JSONB;
