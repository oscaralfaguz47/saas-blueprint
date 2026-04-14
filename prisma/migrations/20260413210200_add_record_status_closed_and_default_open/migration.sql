-- AlterEnum: CLOSED (committed in this migration before any use of new values in same tx is N/A for CLOSED)
ALTER TYPE "RecordStatus" ADD VALUE 'CLOSED';

-- OPEN exists from prior migration; safe to reference here.
ALTER TABLE "Record" ALTER COLUMN "status" SET DEFAULT 'OPEN'::"RecordStatus";
