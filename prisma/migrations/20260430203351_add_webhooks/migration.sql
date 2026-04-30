-- CreateEnum
CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED_AUTO');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED_RETRY', 'FAILED_FINAL', 'CANCELED');

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "url" VARCHAR(2048) NOT NULL,
    "subscribedEvents" JSONB NOT NULL,
    "secretHash" VARCHAR(64) NOT NULL,
    "secretHint" VARCHAR(8) NOT NULL,
    "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMPTZ(6),
    "lastFailureAt" TIMESTAMPTZ(6),
    "disabledAutoAt" TIMESTAMPTZ(6),
    "disabledAutoReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" VARCHAR(64) NOT NULL,
    "eventName" VARCHAR(80) NOT NULL,
    "payloadVersion" VARCHAR(8) NOT NULL DEFAULT 'v1',
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMPTZ(6),
    "lastResponseStatus" INTEGER,
    "lastResponseDurationMs" INTEGER,
    "lastResponseBodyExcerpt" VARCHAR(1000),
    "lastErrorMessage" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" TIMESTAMPTZ(6),
    "finalFailedAt" TIMESTAMPTZ(6),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_status_deletedAt_idx" ON "WebhookEndpoint"("tenantId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_deletedAt_createdAt_idx" ON "WebhookEndpoint"("tenantId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_status_nextAttemptAt_idx" ON "WebhookDelivery"("tenantId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_endpointId_status_createdAt_idx" ON "WebhookDelivery"("tenantId", "endpointId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_eventId_idx" ON "WebhookDelivery"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_status_createdAt_idx" ON "WebhookDelivery"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
