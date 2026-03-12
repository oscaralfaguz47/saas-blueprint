-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "providerCustomerId" VARCHAR(191);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Tenant_providerCustomerId_key" ON "Tenant"("providerCustomerId");
