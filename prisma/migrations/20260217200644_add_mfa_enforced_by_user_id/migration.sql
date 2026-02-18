-- AlterTable
ALTER TABLE "UserSecurity" ADD COLUMN     "mfaEnforcedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "UserSecurity_mfaEnforced_idx" ON "UserSecurity"("mfaEnforced");
