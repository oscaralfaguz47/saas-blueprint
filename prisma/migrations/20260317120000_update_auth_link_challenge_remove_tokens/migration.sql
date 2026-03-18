-- AlterTable
ALTER TABLE "AuthLinkChallenge" DROP COLUMN "accessTokenEnc",
DROP COLUMN "refreshTokenEnc",
DROP COLUMN "tokenExpiresAt";

-- AlterTable
ALTER TABLE "AuthLinkChallenge" ADD COLUMN "pendingRawToken" VARCHAR(191),
ADD COLUMN "cookieIssuedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuthLinkChallenge_pendingRawToken_idx" ON "AuthLinkChallenge"("pendingRawToken");
