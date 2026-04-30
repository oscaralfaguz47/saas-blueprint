-- CreateEnum
CREATE TYPE "ApprovalRoutingRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApprovalRoutingMode" AS ENUM ('SEQUENTIAL', 'PARALLEL');

-- CreateEnum
CREATE TYPE "ApprovalEscalationPolicy" AS ENUM ('NONE', 'ESCALATE_AFTER_HOURS', 'AUTO_DELEGATE');

-- CreateEnum
CREATE TYPE "ApproverTargetType" AS ENUM ('SPECIFIC_USER', 'ROLE', 'TEAM', 'CREATOR_MANAGER');

-- CreateEnum
CREATE TYPE "ApprovalRoutingOutcome" AS ENUM ('APPROVERS_ASSIGNED', 'NO_RULE_MATCHED', 'ERROR');

-- AlterEnum
ALTER TYPE "RecordParticipantStatus" ADD VALUE 'PENDING_BLOCKED';

-- CreateTable
CREATE TABLE "ApprovalRoutingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "mode" "ApprovalRoutingMode" NOT NULL DEFAULT 'PARALLEL',
    "status" "ApprovalRoutingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "escalationPolicy" "ApprovalEscalationPolicy" NOT NULL DEFAULT 'NONE',
    "escalationHours" INTEGER,
    "escalationTargetMembershipId" TEXT,
    "triggerOnCreate" BOOLEAN NOT NULL DEFAULT true,
    "triggerOnAmountChange" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ApprovalRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRoutingRuleCondition" (
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

    CONSTRAINT "ApprovalRoutingRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRoutingRuleApprover" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL DEFAULT 1,
    "targetType" "ApproverTargetType" NOT NULL,
    "targetMembershipId" TEXT,
    "targetWorkspaceRole" "WorkspaceRole",
    "targetFinanceResponsibility" "FinanceResponsibility",
    "targetTeamId" TEXT,
    "requireAll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ApprovalRoutingRuleApprover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRoutingEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "triggeredByEvent" VARCHAR(80) NOT NULL,
    "triggeredByUserId" TEXT,
    "triggeredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "ApprovalRoutingOutcome" NOT NULL,
    "matchedRuleId" TEXT,
    "rulesEvaluated" JSONB NOT NULL,
    "approversAssigned" JSONB NOT NULL,
    "evaluationDurationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" VARCHAR(500),

    CONSTRAINT "ApprovalRoutingEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRoutingRule_tenantId_status_priority_deletedAt_idx" ON "ApprovalRoutingRule"("tenantId", "status", "priority", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRoutingRule_tenantId_name_key" ON "ApprovalRoutingRule"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ApprovalRoutingRuleCondition_tenantId_ruleId_deletedAt_idx" ON "ApprovalRoutingRuleCondition"("tenantId", "ruleId", "deletedAt");

-- CreateIndex
CREATE INDEX "ApprovalRoutingRuleApprover_tenantId_ruleId_sequenceOrder_d_idx" ON "ApprovalRoutingRuleApprover"("tenantId", "ruleId", "sequenceOrder", "deletedAt");

-- CreateIndex
CREATE INDEX "ApprovalRoutingEvaluation_tenantId_recordId_triggeredAt_idx" ON "ApprovalRoutingEvaluation"("tenantId", "recordId", "triggeredAt");

-- CreateIndex
CREATE INDEX "ApprovalRoutingEvaluation_tenantId_outcome_triggeredAt_idx" ON "ApprovalRoutingEvaluation"("tenantId", "outcome", "triggeredAt");

-- AddForeignKey
ALTER TABLE "ApprovalRoutingRule" ADD CONSTRAINT "ApprovalRoutingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingRule" ADD CONSTRAINT "ApprovalRoutingRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingRuleCondition" ADD CONSTRAINT "ApprovalRoutingRuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRoutingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingRuleApprover" ADD CONSTRAINT "ApprovalRoutingRuleApprover_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRoutingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingEvaluation" ADD CONSTRAINT "ApprovalRoutingEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingEvaluation" ADD CONSTRAINT "ApprovalRoutingEvaluation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoutingEvaluation" ADD CONSTRAINT "ApprovalRoutingEvaluation_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "ApprovalRoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
