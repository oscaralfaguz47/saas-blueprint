-- AlterTable: add revokedAt and createdAt to TenantInvitation
ALTER TABLE "TenantInvitation" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "TenantInvitation" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: unique tokenHash (required by A3 for integrity)
CREATE UNIQUE INDEX "TenantInvitation_tokenHash_key" ON "TenantInvitation"("tokenHash");

-- Partial unique index: only one non-accepted, non-revoked invite per (tenantId, email).
-- (Expiration is enforced in application logic; now() cannot be used in index predicate.)
CREATE UNIQUE INDEX "TenantInvitation_tenantId_email_active_key" ON "TenantInvitation"("tenantId", "email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
