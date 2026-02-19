-- CreateEnum
CREATE TYPE "MeterKey" AS ENUM ('REQUESTS', 'PDF_EXPORTS', 'ZIP_EXPORTS');

-- CreateEnum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "TenantBillingState" (
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "rolloverRequests" INTEGER NOT NULL DEFAULT 0,
    "planCode" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBillingState_pkey" PRIMARY KEY ("tenantId","periodStart")
);

-- CreateTable
CREATE TABLE "TenantUsageCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "meter" "MeterKey" NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TenantUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUsageLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "meter" "MeterKey" NOT NULL,
    "delta" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantUsageLedger_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Record" ADD COLUMN "submitCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "TenantBillingState_periodStart_idx" ON "TenantBillingState"("periodStart");

-- CreateIndex
CREATE INDEX "TenantBillingState_periodEnd_idx" ON "TenantBillingState"("periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUsageCounter_tenantId_periodStart_meter_key" ON "TenantUsageCounter"("tenantId", "periodStart", "meter");

-- CreateIndex
CREATE INDEX "TenantUsageCounter_tenantId_meter_periodStart_idx" ON "TenantUsageCounter"("tenantId", "meter", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUsageLedger_idempotencyKey_key" ON "TenantUsageLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TenantUsageLedger_tenantId_periodStart_meter_idx" ON "TenantUsageLedger"("tenantId", "periodStart", "meter");

-- AddForeignKey
ALTER TABLE "TenantBillingState" ADD CONSTRAINT "TenantBillingState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUsageCounter" ADD CONSTRAINT "TenantUsageCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUsageLedger" ADD CONSTRAINT "TenantUsageLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
