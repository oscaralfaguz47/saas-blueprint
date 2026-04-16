-- CreateTable
CREATE TABLE "VendorInvitation" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "roleName" VARCHAR(80) NOT NULL,
    "tokenHash" VARCHAR(191) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorInvitation_tokenHash_key" ON "VendorInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "VendorInvitation_email_idx" ON "VendorInvitation"("email");

-- CreateIndex
CREATE INDEX "VendorInvitation_tokenHash_idx" ON "VendorInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "VendorInvitation_expiresAt_idx" ON "VendorInvitation"("expiresAt");

-- AddForeignKey
ALTER TABLE "VendorInvitation" ADD CONSTRAINT "VendorInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
