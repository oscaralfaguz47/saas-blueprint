-- DropForeignKey
ALTER TABLE "ApprovalAction" DROP CONSTRAINT "ApprovalAction_approvalRequestId_fkey";

-- DropForeignKey
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_recordId_fkey";

-- DropTable
DROP TABLE "ApprovalAction";

-- DropTable
DROP TABLE "ApprovalRequest";

-- DropEnum
DROP TYPE "ApprovalRequestStatus";
