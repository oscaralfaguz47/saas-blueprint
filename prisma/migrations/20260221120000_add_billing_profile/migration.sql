-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "postalCode" VARCHAR(20),
    "region" VARCHAR(80),
    "city" VARCHAR(120),
    "firstLine" VARCHAR(200),
    "secondLine" VARCHAR(200),
    "companyName" VARCHAR(200),
    "taxIdentifier" VARCHAR(80),
    "updatedByUserId" VARCHAR(191),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfile_tenantId_key" ON "BillingProfile"("tenantId");

-- CreateIndex
CREATE INDEX "BillingProfile_tenantId_idx" ON "BillingProfile"("tenantId");

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
