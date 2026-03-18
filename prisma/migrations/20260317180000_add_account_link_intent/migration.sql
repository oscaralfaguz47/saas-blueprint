-- CreateTable
CREATE TABLE "AccountLinkIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetProvider" VARCHAR(50) NOT NULL,
    "expectedEmail" VARCHAR(191) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountLinkIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountLinkIntent_tokenHash_key" ON "AccountLinkIntent"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountLinkIntent_userId_idx" ON "AccountLinkIntent"("userId");

-- CreateIndex
CREATE INDEX "AccountLinkIntent_expiresAt_idx" ON "AccountLinkIntent"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccountLinkIntent" ADD CONSTRAINT "AccountLinkIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
