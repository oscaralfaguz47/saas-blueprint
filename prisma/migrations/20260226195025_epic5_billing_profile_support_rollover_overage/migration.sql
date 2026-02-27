-- CreateEnum
CREATE TYPE "BillingSupportRequestType" AS ENUM ('INVOICE_BILLING_DETAILS_CHANGE');

-- CreateEnum
CREATE TYPE "BillingSupportRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED');

-- CreateTable
CREATE TABLE "TenantBillingProfile" (
    "tenantId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "postalCode" VARCHAR(32),
    "region" VARCHAR(80),
    "city" VARCHAR(80),
    "addressLine1" VARCHAR(120),
    "addressLine2" VARCHAR(120),
    "companyName" VARCHAR(160),
    "vatId" VARCHAR(64),
    "providerCustomerId" VARCHAR(191),
    "providerBusinessId" VARCHAR(191),
    "providerAddressId" VARCHAR(191),
    "lastSyncedAt" TIMESTAMP(3),
    "syncSource" VARCHAR(40),
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantBillingProfile_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "BillingSupportRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "BillingSupportRequestType" NOT NULL,
    "status" "BillingSupportRequestStatus" NOT NULL DEFAULT 'OPEN',
    "providerInvoiceId" VARCHAR(191),
    "providerTransactionId" VARCHAR(191),
    "requestedData" JSONB NOT NULL,
    "note" VARCHAR(500),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRolloverLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "granted" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantRolloverLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantOverageCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "meter" "MeterKey" NOT NULL,
    "units" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "providerChargeId" VARCHAR(191),
    "status" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantOverageCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantBillingProfile_providerCustomerId_idx" ON "TenantBillingProfile"("providerCustomerId");

-- CreateIndex
CREATE INDEX "TenantBillingProfile_lastSyncedAt_idx" ON "TenantBillingProfile"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "BillingSupportRequest_tenantId_createdAt_idx" ON "BillingSupportRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingSupportRequest_status_createdAt_idx" ON "BillingSupportRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TenantRolloverLot_tenantId_expiresAt_idx" ON "TenantRolloverLot"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "TenantRolloverLot_tenantId_periodStart_idx" ON "TenantRolloverLot"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "TenantOverageCharge_tenantId_createdAt_idx" ON "TenantOverageCharge"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantOverageCharge_tenantId_periodStart_meter_key" ON "TenantOverageCharge"("tenantId", "periodStart", "meter");

-- AddForeignKey
ALTER TABLE "TenantBillingProfile" ADD CONSTRAINT "TenantBillingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSupportRequest" ADD CONSTRAINT "BillingSupportRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRolloverLot" ADD CONSTRAINT "TenantRolloverLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantOverageCharge" ADD CONSTRAINT "TenantOverageCharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
