-- CreateEnum
CREATE TYPE "FinanceStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssignmentRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROUND_ROBIN', 'LEAST_LOADED', 'ROUND_ROBIN_THEN_LEAST', 'SPECIFIC_MEMBER', 'TEAM_LEAD');

-- CreateEnum
CREATE TYPE "ConditionField" AS ENUM ('RECORD_TYPE', 'REQUESTED_AMOUNT', 'CURRENCY_CODE', 'DEPARTMENT_ID', 'COST_CENTER_ID', 'CREATED_BY_USER_ID', 'CREATED_BY_DEPARTMENT_ID', 'TAG', 'CUSTOM_FIELD');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'BETWEEN', 'IS_NULL', 'IS_NOT_NULL', 'CONTAINS');

-- CreateEnum
CREATE TYPE "EvaluationOutcome" AS ENUM ('ASSIGNED', 'NO_RULE_MATCHED', 'NO_CANDIDATES_AVAILABLE', 'ENGINE_DISABLED', 'PLAN_NOT_ENTITLED', 'ERROR');

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "financeAssignedAt" TIMESTAMPTZ(6),
ADD COLUMN     "financeAssignedByRuleId" TEXT,
ADD COLUMN     "financeAssignedMembershipId" TEXT,
ADD COLUMN     "financeStatus" "FinanceStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- CreateTable
CREATE TABLE "FinanceAssignmentRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "teamId" TEXT NOT NULL,
    "strategy" "AssignmentStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "specificMembershipId" TEXT,
    "status" "AssignmentRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "FinanceAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssignmentRuleCondition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "field" "ConditionField" NOT NULL,
    "operator" "ConditionOperator" NOT NULL,
    "valueString" VARCHAR(255),
    "valueNumber" DECIMAL(20,4),
    "valueJson" JSONB,
    "customFieldKey" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "FinanceAssignmentRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssignmentEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "triggeredByEvent" VARCHAR(80) NOT NULL,
    "triggeredByUserId" TEXT,
    "triggeredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "EvaluationOutcome" NOT NULL,
    "matchedRuleId" TEXT,
    "assignedMembershipId" TEXT,
    "rulesEvaluated" JSONB NOT NULL,
    "candidatesEvaluated" JSONB NOT NULL,
    "selectionStrategy" VARCHAR(40),
    "evaluationDurationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" VARCHAR(500),

    CONSTRAINT "FinanceAssignmentEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAssignmentRule_tenantId_status_priority_deletedAt_idx" ON "FinanceAssignmentRule"("tenantId", "status", "priority", "deletedAt");

-- CreateIndex
CREATE INDEX "FinanceAssignmentRule_tenantId_teamId_idx" ON "FinanceAssignmentRule"("tenantId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssignmentRule_tenantId_name_key" ON "FinanceAssignmentRule"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FinanceAssignmentRuleCondition_tenantId_ruleId_deletedAt_idx" ON "FinanceAssignmentRuleCondition"("tenantId", "ruleId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinanceAssignmentEvaluation_tenantId_recordId_triggeredAt_idx" ON "FinanceAssignmentEvaluation"("tenantId", "recordId", "triggeredAt");

-- CreateIndex
CREATE INDEX "FinanceAssignmentEvaluation_tenantId_outcome_triggeredAt_idx" ON "FinanceAssignmentEvaluation"("tenantId", "outcome", "triggeredAt");

-- CreateIndex
CREATE INDEX "FinanceAssignmentEvaluation_tenantId_matchedRuleId_triggere_idx" ON "FinanceAssignmentEvaluation"("tenantId", "matchedRuleId", "triggeredAt");

-- CreateIndex
CREATE INDEX "Record_tenantId_financeStatus_financeAssignedAt_idx" ON "Record"("tenantId", "financeStatus", "financeAssignedAt");

-- CreateIndex
CREATE INDEX "Record_tenantId_financeAssignedMembershipId_financeStatus_idx" ON "Record"("tenantId", "financeAssignedMembershipId", "financeStatus");

-- AddForeignKey
ALTER TABLE "FinanceAssignmentRule" ADD CONSTRAINT "FinanceAssignmentRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssignmentRule" ADD CONSTRAINT "FinanceAssignmentRule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FinanceTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssignmentRule" ADD CONSTRAINT "FinanceAssignmentRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssignmentRuleCondition" ADD CONSTRAINT "FinanceAssignmentRuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FinanceAssignmentRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssignmentEvaluation" ADD CONSTRAINT "FinanceAssignmentEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssignmentEvaluation" ADD CONSTRAINT "FinanceAssignmentEvaluation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssignmentEvaluation" ADD CONSTRAINT "FinanceAssignmentEvaluation_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "FinanceAssignmentRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_financeAssignedMembershipId_fkey" FOREIGN KEY ("financeAssignedMembershipId") REFERENCES "TenantMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_financeAssignedByRuleId_fkey" FOREIGN KEY ("financeAssignedByRuleId") REFERENCES "FinanceAssignmentRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
