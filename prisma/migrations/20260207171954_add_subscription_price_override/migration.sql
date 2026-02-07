-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "currency" VARCHAR(10),
ADD COLUMN     "discountEndsAt" TIMESTAMP(3),
ADD COLUMN     "discountNote" VARCHAR(300),
ADD COLUMN     "priceOverrideMonthly" INTEGER,
ADD COLUMN     "priceOverrideYearly" INTEGER;
