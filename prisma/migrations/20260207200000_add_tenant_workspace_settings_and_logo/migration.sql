-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "logoObjectKey" VARCHAR(512),
ADD COLUMN     "timezone" VARCHAR(64),
ADD COLUMN     "currency" VARCHAR(10),
ADD COLUMN     "dateFormat" VARCHAR(32),
ADD COLUMN     "description" VARCHAR(500);
