-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RECORD_APPROVAL_REQUESTED';

-- AlterEnum
ALTER TYPE "RecordEventType" ADD VALUE 'APPROVERS_ASSIGNED';

-- AlterTable
ALTER TABLE "RecordParticipant" ADD COLUMN "routingApproverId" TEXT,
ADD COLUMN "routingRuleId" TEXT,
ADD COLUMN "sequenceOrder" INTEGER;

-- CreateIndex
CREATE INDEX "RecordParticipant_recordId_sequenceOrder_idx" ON "RecordParticipant"("recordId", "sequenceOrder");

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_routingRuleId_fkey" FOREIGN KEY ("routingRuleId") REFERENCES "ApprovalRoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_routingApproverId_fkey" FOREIGN KEY ("routingApproverId") REFERENCES "ApprovalRoutingRuleApprover"("id") ON DELETE SET NULL ON UPDATE CASCADE;
