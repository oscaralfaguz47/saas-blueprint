-- AlterTable
ALTER TABLE "TenantInvitation" ADD COLUMN     "billingAccess" "BillingAccessLevel" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "financeResponsibility" "FinanceResponsibility" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "financialAccess" "FinancialAccessScope" NOT NULL DEFAULT 'OWN_AND_PARTICIPATING',
ADD COLUMN     "workspaceRole" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER';
