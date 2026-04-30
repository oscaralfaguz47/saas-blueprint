-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "financeOpenAssignmentsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FinanceTeam" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timeZone" VARCHAR(64),
    "maxConcurrentAssignments" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedByUserId" TEXT,

    CONSTRAINT "FinanceTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTeamMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" TEXT,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "FinanceTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceTeam_tenantId_isActive_deletedAt_idx" ON "FinanceTeam"("tenantId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "FinanceTeam_tenantId_departmentId_idx" ON "FinanceTeam"("tenantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTeam_tenantId_name_key" ON "FinanceTeam"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FinanceTeamMember_tenantId_teamId_deletedAt_idx" ON "FinanceTeamMember"("tenantId", "teamId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinanceTeamMember_tenantId_membershipId_deletedAt_idx" ON "FinanceTeamMember"("tenantId", "membershipId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTeamMember_teamId_membershipId_key" ON "FinanceTeamMember"("teamId", "membershipId");

-- AddForeignKey
ALTER TABLE "FinanceTeam" ADD CONSTRAINT "FinanceTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTeam" ADD CONSTRAINT "FinanceTeam_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "TenantDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTeam" ADD CONSTRAINT "FinanceTeam_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTeam" ADD CONSTRAINT "FinanceTeam_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTeamMember" ADD CONSTRAINT "FinanceTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FinanceTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTeamMember" ADD CONSTRAINT "FinanceTeamMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTeamMember" ADD CONSTRAINT "FinanceTeamMember_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
