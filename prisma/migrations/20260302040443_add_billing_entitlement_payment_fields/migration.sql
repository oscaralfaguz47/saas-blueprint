-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingPlanCode" VARCHAR(50),
ADD COLUMN     "currentEntitlementPlanCode" VARCHAR(50),
ADD COLUMN     "entitlementEffectiveUntil" TIMESTAMPTZ(6),
ADD COLUMN     "graceEndsAt" TIMESTAMPTZ(6),
ADD COLUMN     "lastPaymentFailureCode" VARCHAR(100),
ADD COLUMN     "lastPaymentFailureMessage" VARCHAR(500),
ADD COLUMN     "latestTransactionId" VARCHAR(191),
ADD COLUMN     "pastDueSince" TIMESTAMPTZ(6),
ADD COLUMN     "paymentStatus" VARCHAR(30),
ADD COLUMN     "pendingChangeType" VARCHAR(50),
ADD COLUMN     "pendingEffectiveAt" TIMESTAMPTZ(6);
