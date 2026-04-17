-- CreateTable
CREATE TABLE "TenantDepartment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(40),
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,

    CONSTRAINT "TenantDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantCostCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,

    CONSTRAINT "TenantCostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantDepartment_tenantId_name_key" ON "TenantDepartment"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TenantDepartment_tenantId_isActive_idx" ON "TenantDepartment"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TenantDepartment_tenantId_name_idx" ON "TenantDepartment"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TenantCostCenter_tenantId_code_key" ON "TenantCostCenter"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TenantCostCenter_tenantId_departmentId_isActive_idx" ON "TenantCostCenter"("tenantId", "departmentId", "isActive");

-- CreateIndex
CREATE INDEX "TenantCostCenter_tenantId_isActive_idx" ON "TenantCostCenter"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TenantCostCenter_tenantId_code_idx" ON "TenantCostCenter"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "TenantDepartment" ADD CONSTRAINT "TenantDepartment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDepartment" ADD CONSTRAINT "TenantDepartment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDepartment" ADD CONSTRAINT "TenantDepartment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCostCenter" ADD CONSTRAINT "TenantCostCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCostCenter" ADD CONSTRAINT "TenantCostCenter_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "TenantDepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCostCenter" ADD CONSTRAINT "TenantCostCenter_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCostCenter" ADD CONSTRAINT "TenantCostCenter_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "costCenterId" TEXT;

-- CreateIndex
CREATE INDEX "Record_tenantId_departmentId_idx" ON "Record"("tenantId", "departmentId");

-- CreateIndex
CREATE INDEX "Record_tenantId_costCenterId_idx" ON "Record"("tenantId", "costCenterId");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "TenantDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "TenantCostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
