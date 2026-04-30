-- CreateEnum
CREATE TYPE "DelegationFinanceHandoffPolicy" AS ENUM ('HYBRID', 'ALWAYS_REVERT', 'ALWAYS_KEEP');

-- CreateTable
CREATE TABLE "TenantFinanceSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "delegationFinanceHandoffPolicy" "DelegationFinanceHandoffPolicy" NOT NULL DEFAULT 'HYBRID',
    "delegationApprovalHandoffPolicy" "DelegationFinanceHandoffPolicy" NOT NULL DEFAULT 'HYBRID',
    "maxDelegationWindowDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TenantFinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantFinanceSettings_tenantId_key" ON "TenantFinanceSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantFinanceSettings" ADD CONSTRAINT "TenantFinanceSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
