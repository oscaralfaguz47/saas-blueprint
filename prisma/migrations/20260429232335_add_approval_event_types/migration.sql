-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecordEventType" ADD VALUE 'APPROVAL_STATUS_CHANGED';
ALTER TYPE "RecordEventType" ADD VALUE 'APPROVAL_FULLY_COMPLETED';
ALTER TYPE "RecordEventType" ADD VALUE 'APPROVAL_REJECTED_FINAL';
