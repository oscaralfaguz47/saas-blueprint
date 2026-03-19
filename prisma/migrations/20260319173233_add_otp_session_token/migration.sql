-- CreateTable
CREATE TABLE "OtpSessionToken" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpSessionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OtpSessionToken_tokenHash_key" ON "OtpSessionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OtpSessionToken_userId_idx" ON "OtpSessionToken"("userId");

-- CreateIndex
CREATE INDEX "OtpSessionToken_expiresAt_idx" ON "OtpSessionToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "OtpSessionToken" ADD CONSTRAINT "OtpSessionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
