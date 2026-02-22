-- AlterTable: BillingProfile invoice-first and Paddle reconciliation fields
-- Make countryCode nullable (optional billing).
ALTER TABLE "BillingProfile" ALTER COLUMN "countryCode" DROP NOT NULL;

-- Paddle identifiers for invoice-first sync.
ALTER TABLE "BillingProfile" ADD COLUMN "paddleCustomerId" VARCHAR(191);
ALTER TABLE "BillingProfile" ADD COLUMN "paddleAddressId" VARCHAR(191);
ALTER TABLE "BillingProfile" ADD COLUMN "paddleBusinessId" VARCHAR(191);

-- Reconcile: final country from Paddle and mismatch flag.
ALTER TABLE "BillingProfile" ADD COLUMN "paddleFinalCountryCode" VARCHAR(2);
ALTER TABLE "BillingProfile" ADD COLUMN "paddleFinalCountryUpdatedAt" TIMESTAMP(3);
ALTER TABLE "BillingProfile" ADD COLUMN "countryMismatch" BOOLEAN NOT NULL DEFAULT false;
