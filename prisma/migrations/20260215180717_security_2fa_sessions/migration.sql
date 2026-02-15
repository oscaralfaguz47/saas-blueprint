-- CreateEnum
CREATE TYPE "SessionAuthLevel" AS ENUM ('FULL', 'PENDING_MFA');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "authLevel" "SessionAuthLevel" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ipFirstSeen" VARCHAR(64),
ADD COLUMN     "lastIp" VARCHAR(64),
ADD COLUMN     "logoutReason" VARCHAR(50),
ADD COLUMN     "mfaChallengeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "userAgent" VARCHAR(300);

-- AlterTable
ALTER TABLE "UserSecurity" ADD COLUMN     "backupCodesGeneratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RememberedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "label" VARCHAR(80),
    "userAgent" VARCHAR(300),
    "ipFirstSeen" VARCHAR(64),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RememberedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RememberedDevice_tokenHash_key" ON "RememberedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "RememberedDevice_userId_expiresAt_idx" ON "RememberedDevice"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RememberedDevice_userId_revokedAt_idx" ON "RememberedDevice"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");

-- CreateIndex
CREATE INDEX "Session_userId_authLevel_idx" ON "Session"("userId", "authLevel");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "RememberedDevice" ADD CONSTRAINT "RememberedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
