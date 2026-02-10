-- AlterEnum: add DRAFT to TenantStatus (A5 first-time setup)
ALTER TYPE "TenantStatus" ADD VALUE 'DRAFT' BEFORE 'ACTIVE';

-- Add new columns (nullable first for backfill)
ALTER TABLE "Tenant" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- Backfill createdByUserId from first membership per tenant
UPDATE "Tenant" t
SET "createdByUserId" = (
  SELECT tm."userId"
  FROM "TenantMembership" tm
  WHERE tm."tenantId" = t.id
  ORDER BY tm."joinedAt" ASC NULLS LAST
  LIMIT 1
)
WHERE t."createdByUserId" IS NULL;

-- Fallback for tenants with no memberships (should not happen in practice)
UPDATE "Tenant" t
SET "createdByUserId" = (SELECT "id" FROM "User" LIMIT 1)
WHERE t."createdByUserId" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "Tenant" ALTER COLUMN "createdByUserId" SET NOT NULL;

-- Foreign key
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes for A5 (createdByUserId, status)
CREATE INDEX "Tenant_createdByUserId_idx" ON "Tenant"("createdByUserId");
CREATE INDEX "Tenant_createdByUserId_status_idx" ON "Tenant"("createdByUserId", "status");

-- Case-insensitive unique slug (A5 claim flow)
CREATE UNIQUE INDEX "Tenant_slug_lower_key" ON "Tenant"(LOWER("slug"));
