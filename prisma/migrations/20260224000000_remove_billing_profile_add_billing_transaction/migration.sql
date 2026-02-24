-- EPIC 4: Remove BillingProfile (no address stored); add BillingTransaction for transaction history.
-- DropTable (drops FK from BillingProfile to Tenant automatically)
DROP TABLE IF EXISTS "BillingProfile";

-- CreateTable
CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "providerTransactionId" VARCHAR(191) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "billedAt" TIMESTAMP(3),
    "currency" VARCHAR(10) NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "invoiceUrl" VARCHAR(600),
    "receiptNumber" VARCHAR(120),
    "planCode" VARCHAR(50),
    "subscriptionId" TEXT,
    "providerSubscriptionId" VARCHAR(191),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_providerTransactionId_key" ON "BillingTransaction"("providerTransactionId");

-- CreateIndex
CREATE INDEX "BillingTransaction_tenantId_billedAt_idx" ON "BillingTransaction"("tenantId", "billedAt");

-- CreateIndex
CREATE INDEX "BillingTransaction_tenantId_status_idx" ON "BillingTransaction"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BillingTransaction_provider_providerSubscriptionId_idx" ON "BillingTransaction"("provider", "providerSubscriptionId");

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
