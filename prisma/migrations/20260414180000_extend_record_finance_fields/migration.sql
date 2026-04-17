-- CreateEnum
CREATE TYPE "RecordPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RecordBudgetImpactType" AS ENUM ('NEW_SPEND', 'BUDGET_REALLOCATION', 'OVER_BUDGET', 'NO_BUDGET_IMPACT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecordRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecordCloseReason" AS ENUM ('APPROVED_AND_COMPLETED', 'REJECTED', 'WITHDRAWN_BY_REQUESTER', 'DUPLICATE', 'SUPERSEDED', 'NO_ACTION_REQUIRED', 'PAID_OR_SETTLED', 'CANCELED', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordEvidenceCategory" AS ENUM ('INVOICE', 'QUOTE', 'RECEIPT', 'CONTRACT', 'STATEMENT_OF_WORK', 'APPROVAL_MEMO', 'SUPPORTING_SPREADSHEET', 'SCREENSHOT', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordApprovalStatus" AS ENUM ('NOT_STARTED', 'NO_APPROVERS_ASSIGNED', 'WAITING_FOR_APPROVAL', 'FULLY_APPROVED', 'APPROVAL_REJECTED', 'APPROVAL_EXPIRED');

-- AlterEnum
ALTER TYPE "RecordType" ADD VALUE 'BUDGET_REQUEST';
ALTER TYPE "RecordType" ADD VALUE 'SPEND_APPROVAL';
ALTER TYPE "RecordType" ADD VALUE 'VENDOR_PAYMENT_REQUEST';
ALTER TYPE "RecordType" ADD VALUE 'REIMBURSEMENT';
ALTER TYPE "RecordType" ADD VALUE 'FINANCIAL_EXCEPTION';
ALTER TYPE "RecordType" ADD VALUE 'CONTRACT_SCOPE_CHANGE';
ALTER TYPE "RecordType" ADD VALUE 'FORECAST_ADJUSTMENT';
ALTER TYPE "RecordType" ADD VALUE 'OTHER_FINANCIAL_REQUEST';

-- AlterEnum
ALTER TYPE "RecordStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "RecordStatus" ADD VALUE 'AWAITING_INFO';
ALTER TYPE "RecordStatus" ADD VALUE 'CANCELED';

-- AlterEnum
ALTER TYPE "RecordLinkType" ADD VALUE 'BLOCKED_BY';
ALTER TYPE "RecordLinkType" ADD VALUE 'DUPLICATE_OF';
ALTER TYPE "RecordLinkType" ADD VALUE 'CHILD_OF';
ALTER TYPE "RecordLinkType" ADD VALUE 'PARENT_OF';
ALTER TYPE "RecordLinkType" ADD VALUE 'AMENDS';
ALTER TYPE "RecordLinkType" ADD VALUE 'SUPERSEDES';
ALTER TYPE "RecordLinkType" ADD VALUE 'FUNDED_BY';
ALTER TYPE "RecordLinkType" ADD VALUE 'TRIGGERED_BY';

-- AlterEnum
ALTER TYPE "RecordCommentScope" ADD VALUE 'INTERNAL';

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "recordKey" VARCHAR(30),
ADD COLUMN     "requestedAmount" DECIMAL(14,2),
ADD COLUMN     "approvedAmount" DECIMAL(14,2),
ADD COLUMN     "currencyCode" VARCHAR(10),
ADD COLUMN     "amountIsEstimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceNotes" VARCHAR(500),
ADD COLUMN     "budgetImpactType" "RecordBudgetImpactType",
ADD COLUMN     "taxAmount" DECIMAL(14,2),
ADD COLUMN     "taxIncluded" BOOLEAN,
ADD COLUMN     "vendorName" VARCHAR(160),
ADD COLUMN     "payeeName" VARCHAR(160),
ADD COLUMN     "invoiceNumber" VARCHAR(100),
ADD COLUMN     "contractReference" VARCHAR(100),
ADD COLUMN     "purchaseOrderRef" VARCHAR(100),
ADD COLUMN     "priority" "RecordPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "businessJustification" VARCHAR(2000),
ADD COLUMN     "departmentName" VARCHAR(120),
ADD COLUMN     "costCenterCode" VARCHAR(60),
ADD COLUMN     "neededByDate" TIMESTAMPTZ(6),
ADD COLUMN     "submittedAt" TIMESTAMPTZ(6),
ADD COLUMN     "approvedAt" TIMESTAMPTZ(6),
ADD COLUMN     "firstResponseAt" TIMESTAMPTZ(6),
ADD COLUMN     "hasPolicyException" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "policyExceptionReason" VARCHAR(1000),
ADD COLUMN     "isOverBudget" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missingRequiredEvidence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskLevel" "RecordRiskLevel",
ADD COLUMN     "requiresFinanceReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "closeReason" "RecordCloseReason",
ADD COLUMN     "closeReasonNotes" VARCHAR(1000),
ADD COLUMN     "approvalStatus" "RecordApprovalStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "overdue" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RecordEvidence" ADD COLUMN     "evidenceCategory" "RecordEvidenceCategory",
ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Record_tenantId_priority_idx" ON "Record"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "Record_tenantId_neededByDate_idx" ON "Record"("tenantId", "neededByDate");

-- CreateIndex
CREATE INDEX "Record_tenantId_overdue_idx" ON "Record"("tenantId", "overdue");

-- CreateIndex
CREATE INDEX "Record_tenantId_approvalStatus_idx" ON "Record"("tenantId", "approvalStatus");

-- CreateIndex
CREATE INDEX "Record_recordKey_idx" ON "Record"("recordKey");
