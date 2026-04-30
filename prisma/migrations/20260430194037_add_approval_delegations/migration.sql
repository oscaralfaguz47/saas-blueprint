-- CreateEnum
CREATE TYPE "DelegationScope" AS ENUM ('ALL', 'APPROVALS_ONLY', 'FINANCE_ONLY');

-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "RecordParticipant" ADD COLUMN     "delegatedToParticipantId" TEXT,
ADD COLUMN     "delegatedViaDelegationId" TEXT;

-- CreateTable
CREATE TABLE "ApprovalDelegation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "delegatorMembershipId" TEXT NOT NULL,
    "delegateMembershipId" TEXT NOT NULL,
    "scope" "DelegationScope" NOT NULL,
    "maxAmount" DECIMAL(20,4),
    "maxAmountCurrency" VARCHAR(3),
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "DelegationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "activatedAt" TIMESTAMPTZ(6),
    "deactivatedAt" TIMESTAMPTZ(6),
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedByUserId" TEXT,

    CONSTRAINT "ApprovalDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalDelegation_tenantId_status_startsAt_endsAt_idx" ON "ApprovalDelegation"("tenantId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_tenantId_delegatorMembershipId_status_idx" ON "ApprovalDelegation"("tenantId", "delegatorMembershipId", "status");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_tenantId_delegateMembershipId_status_idx" ON "ApprovalDelegation"("tenantId", "delegateMembershipId", "status");

-- CreateIndex
CREATE INDEX "RecordParticipant_tenantId_delegatedToParticipantId_idx" ON "RecordParticipant"("tenantId", "delegatedToParticipantId");

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_delegatorMembershipId_fkey" FOREIGN KEY ("delegatorMembershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_delegateMembershipId_fkey" FOREIGN KEY ("delegateMembershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_delegatedToParticipantId_fkey" FOREIGN KEY ("delegatedToParticipantId") REFERENCES "RecordParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_delegatedViaDelegationId_fkey" FOREIGN KEY ("delegatedViaDelegationId") REFERENCES "ApprovalDelegation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
