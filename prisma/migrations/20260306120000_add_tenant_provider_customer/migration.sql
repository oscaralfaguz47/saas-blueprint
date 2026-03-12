-- CreateTable
CREATE TABLE "TenantProviderCustomer" (
    "tenantId" TEXT NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "providerCustomerId" VARCHAR(191),
    "billingEmail" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantProviderCustomer_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantProviderCustomer_providerCustomerId_key" ON "TenantProviderCustomer"("providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantProviderCustomer_billingEmail_key" ON "TenantProviderCustomer"("billingEmail");

-- CreateIndex
CREATE INDEX "TenantProviderCustomer_providerCustomerId_idx" ON "TenantProviderCustomer"("providerCustomerId");

-- CreateIndex
CREATE INDEX "TenantProviderCustomer_billingEmail_idx" ON "TenantProviderCustomer"("billingEmail");

-- AddForeignKey
ALTER TABLE "TenantProviderCustomer" ADD CONSTRAINT "TenantProviderCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
