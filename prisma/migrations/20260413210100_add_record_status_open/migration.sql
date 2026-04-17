-- AlterEnum: OPEN must be committed before it can be used as a default (PG safety rule).
ALTER TYPE "RecordStatus" ADD VALUE 'OPEN';
