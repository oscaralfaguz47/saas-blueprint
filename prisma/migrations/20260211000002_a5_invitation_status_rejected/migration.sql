-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "TenantInvitation" ADD COLUMN "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectedByUserId" TEXT;

-- Backfill status from existing columns
UPDATE "TenantInvitation"
SET "status" = CASE
  WHEN "acceptedAt" IS NOT NULL THEN 'ACCEPTED'::"InvitationStatus"
  WHEN "revokedAt" IS NOT NULL THEN 'REVOKED'::"InvitationStatus"
  WHEN "expiresAt" < NOW() THEN 'EXPIRED'::"InvitationStatus"
  ELSE 'PENDING'::"InvitationStatus"
END;

-- CreateIndex
CREATE INDEX "TenantInvitation_status_idx" ON "TenantInvitation"("status");

-- AddForeignKey
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
