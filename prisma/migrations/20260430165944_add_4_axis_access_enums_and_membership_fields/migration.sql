-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "FinancialAccessScope" AS ENUM ('ALL', 'DEPARTMENT', 'OWN_AND_PARTICIPATING', 'NONE');

-- CreateEnum
CREATE TYPE "FinanceResponsibility" AS ENUM ('PROCESS', 'APPROVE', 'PROCESS_AND_APPROVE', 'NONE');

-- CreateEnum
CREATE TYPE "BillingAccessLevel" AS ENUM ('MANAGE', 'READ', 'NONE');

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "billingAccess" "BillingAccessLevel" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "financeResponsibility" "FinanceResponsibility" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "financialAccess" "FinancialAccessScope" NOT NULL DEFAULT 'OWN_AND_PARTICIPATING',
ADD COLUMN     "workspaceRole" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER';

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_workspaceRole_idx" ON "TenantMembership"("tenantId", "workspaceRole");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_financeResponsibility_idx" ON "TenantMembership"("tenantId", "financeResponsibility");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_billingAccess_idx" ON "TenantMembership"("tenantId", "billingAccess");
