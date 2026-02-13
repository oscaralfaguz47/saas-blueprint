-- CreateEnum
CREATE TYPE "AppearanceMode" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appearance" "AppearanceMode" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "phone" VARCHAR(30),
ADD COLUMN     "profilePhotoObjectKey" VARCHAR(512),
ADD COLUMN     "timezone" VARCHAR(64);

-- AlterTable
ALTER TABLE "UserSecurity" ADD COLUMN     "autoLogoutEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoLogoutHours" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "backupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "forceLogoutAt" TIMESTAMP(3),
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpPendingSecretEnc" VARCHAR(500),
ADD COLUMN     "totpSecretEnc" VARCHAR(500);

-- CreateIndex
CREATE INDEX "Session_lastActivityAt_idx" ON "Session"("lastActivityAt");

-- CreateIndex
CREATE INDEX "UserSecurity_totpEnabled_idx" ON "UserSecurity"("totpEnabled");

-- CreateIndex
CREATE INDEX "UserSecurity_autoLogoutEnabled_idx" ON "UserSecurity"("autoLogoutEnabled");
