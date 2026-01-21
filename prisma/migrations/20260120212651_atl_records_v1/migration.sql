-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('SCOPE_CHANGE', 'DECISION', 'BUDGET');

-- CreateEnum
CREATE TYPE "RecordVisibility" AS ENUM ('WORKSPACE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED', 'NO_RESPONSE');

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "type" "RecordType" NOT NULL,
    "description" TEXT,
    "clientName" VARCHAR(120),
    "clientEmail" VARCHAR(191),
    "amount" DECIMAL(12,2),
    "currency" VARCHAR(10),
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'WORKSPACE',
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAttachment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "storageProvider" VARCHAR(30) NOT NULL,
    "objectKey" VARCHAR(300) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64),
    "aiExtractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordEvidenceLink" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "url" VARCHAR(800) NOT NULL,
    "label" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordEvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "approverEmail" VARCHAR(191) NOT NULL,
    "approverName" VARCHAR(120),
    "tokenHash" VARCHAR(64) NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Record_tenantId_createdAt_idx" ON "Record"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Record_tenantId_status_idx" ON "Record"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Record_tenantId_type_idx" ON "Record"("tenantId", "type");

-- CreateIndex
CREATE INDEX "RecordAttachment_recordId_createdAt_idx" ON "RecordAttachment"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordEvidenceLink_recordId_createdAt_idx" ON "RecordEvidenceLink"("recordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_tokenHash_key" ON "ApprovalRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "ApprovalRequest_recordId_createdAt_idx" ON "ApprovalRequest"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_expiresAt_idx" ON "ApprovalRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_approverEmail_idx" ON "ApprovalRequest"("approverEmail");

-- CreateIndex
CREATE INDEX "ApprovalAction_approvalRequestId_createdAt_idx" ON "ApprovalAction"("approvalRequestId", "createdAt");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAttachment" ADD CONSTRAINT "RecordAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvidenceLink" ADD CONSTRAINT "RecordEvidenceLink_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
