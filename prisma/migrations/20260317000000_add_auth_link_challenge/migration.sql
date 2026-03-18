-- CreateTable
CREATE TABLE "AuthLinkChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "targetProvider" VARCHAR(50) NOT NULL,
    "targetProviderAccountId" VARCHAR(191) NOT NULL,
    "targetProviderTenantId" VARCHAR(191),
    "callbackUrl" VARCHAR(500),
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" INTEGER,
    "lastSentAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuthLinkChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthLinkChallenge_tokenHash_key" ON "AuthLinkChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthLinkChallenge_userId_idx" ON "AuthLinkChallenge"("userId");

-- CreateIndex
CREATE INDEX "AuthLinkChallenge_expiresAt_idx" ON "AuthLinkChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthLinkChallenge_tokenHash_idx" ON "AuthLinkChallenge"("tokenHash");

-- AddForeignKey
ALTER TABLE "AuthLinkChallenge" ADD CONSTRAINT "AuthLinkChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
