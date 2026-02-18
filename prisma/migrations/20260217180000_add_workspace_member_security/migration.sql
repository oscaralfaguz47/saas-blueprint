-- CreateTable
CREATE TABLE "WorkspaceMemberSecurity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mfaEnforced" BOOLEAN NOT NULL DEFAULT false,
    "enforcedByUserId" TEXT,
    "enforcedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMemberSecurity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMemberSecurity_tenantId_userId_key" ON "WorkspaceMemberSecurity"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "WorkspaceMemberSecurity_tenantId_idx" ON "WorkspaceMemberSecurity"("tenantId");

-- CreateIndex
CREATE INDEX "WorkspaceMemberSecurity_userId_idx" ON "WorkspaceMemberSecurity"("userId");

-- AddForeignKey
ALTER TABLE "WorkspaceMemberSecurity" ADD CONSTRAINT "WorkspaceMemberSecurity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMemberSecurity" ADD CONSTRAINT "WorkspaceMemberSecurity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
