-- CreateEnum
CREATE TYPE "MembershipAvailability" AS ENUM ('AVAILABLE', 'AWAY', 'OUT_OF_OFFICE', 'ON_LEAVE', 'PAUSED');

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "availability" "MembershipAvailability" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "availabilityReason" VARCHAR(500),
ADD COLUMN     "unavailableUntil" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_availability_unavailableUntil_idx" ON "TenantMembership"("tenantId", "availability", "unavailableUntil");
