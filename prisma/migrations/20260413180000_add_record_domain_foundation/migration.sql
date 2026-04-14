-- CreateEnum
CREATE TYPE "RecordEventType" AS ENUM ('RECORD_CREATED', 'RECORD_CLOSED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'APPROVAL_LINK_OPENED', 'EVIDENCE_FILE_ADDED', 'EVIDENCE_FILE_REMOVED', 'EVIDENCE_LINK_ADDED', 'EVIDENCE_LINK_REMOVED', 'COMMENT_ADDED', 'USER_MENTIONED', 'RECORD_SHARED', 'RECORD_LINKED', 'RECORD_UNLINKED', 'PAYMENT_STATUS_SET', 'PAYMENT_EVIDENCE_ADDED', 'PAYMENT_EVIDENCE_REMOVED', 'REMINDER_SENT', 'EXPORT_PDF_GENERATED', 'EXPORT_BUNDLE_GENERATED');

-- CreateEnum
CREATE TYPE "RecordParticipantType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RecordParticipantRole" AS ENUM ('APPROVER', 'VIEWER');

-- CreateEnum
CREATE TYPE "RecordParticipantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecordAccessType" AS ENUM ('VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "RecordAccessReason" AS ENUM ('MANUAL_SHARE', 'MENTION_AUTO_SHARE');

-- CreateEnum
CREATE TYPE "RecordCommentScope" AS ENUM ('GENERAL', 'APPROVAL', 'PAYMENT');

-- CreateEnum
CREATE TYPE "RecordCommentAuthorType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RecordLinkType" AS ENUM ('FULFILLS', 'RELATED');

-- CreateEnum
CREATE TYPE "RecordEvidenceType" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "RecordPaymentStatus" AS ENUM ('NOT_PAID', 'PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "RecordPaymentEvidenceType" AS ENUM ('FILE', 'LINK', 'TEXT');

-- CreateEnum
CREATE TYPE "RecordExportType" AS ENUM ('PDF_APPROVAL_PACKET', 'ZIP_AUDIT_BUNDLE');

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "closedAt" TIMESTAMPTZ(6),
ADD COLUMN     "closedByUserId" TEXT;

-- CreateTable
CREATE TABLE "RecordEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "eventType" "RecordEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" VARCHAR(191),
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "participantType" "RecordParticipantType" NOT NULL,
    "participantRole" "RecordParticipantRole" NOT NULL DEFAULT 'APPROVER',
    "userId" TEXT,
    "email" VARCHAR(191),
    "name" VARCHAR(120),
    "tokenHash" VARCHAR(64),
    "expiresAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "lastUsedAt" TIMESTAMPTZ(6),
    "status" "RecordParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMPTZ(6),
    "responseReason" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "RecordParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessType" "RecordAccessType" NOT NULL DEFAULT 'VIEW',
    "reason" "RecordAccessReason" NOT NULL DEFAULT 'MANUAL_SHARE',
    "grantedByUserId" TEXT,
    "grantedBySystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "authorType" "RecordCommentAuthorType" NOT NULL,
    "authorUserId" TEXT,
    "authorEmail" VARCHAR(191),
    "commentScope" "RecordCommentScope" NOT NULL DEFAULT 'GENERAL',
    "content" VARCHAR(5000) NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordCommentMention" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordCommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "linkType" "RecordLinkType" NOT NULL,
    "fromRecordId" TEXT NOT NULL,
    "toRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "removedAt" TIMESTAMPTZ(6),
    "removedByUserId" TEXT,

    CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "evidenceType" "RecordEvidenceType" NOT NULL,
    "label" VARCHAR(255),
    "url" VARCHAR(2048),
    "storageProvider" VARCHAR(30),
    "objectKey" VARCHAR(512),
    "fileName" VARCHAR(255),
    "mimeType" VARCHAR(120),
    "sizeBytes" INTEGER,
    "sha256" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedByUserId" TEXT,

    CONSTRAINT "RecordEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "RecordPaymentStatus" NOT NULL DEFAULT 'NOT_PAID',
    "setAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RecordPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordPaymentEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "evidenceType" "RecordPaymentEvidenceType" NOT NULL,
    "label" VARCHAR(255),
    "contentText" VARCHAR(5000),
    "url" VARCHAR(2048),
    "storageProvider" VARCHAR(30),
    "objectKey" VARCHAR(512),
    "fileName" VARCHAR(255),
    "mimeType" VARCHAR(120),
    "sizeBytes" INTEGER,
    "sha256" VARCHAR(64),
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "removedAt" TIMESTAMPTZ(6),
    "removedByUserId" TEXT,

    CONSTRAINT "RecordPaymentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordReminderLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentByUserId" TEXT,
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "RecordReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "exportType" "RecordExportType" NOT NULL,
    "storageProvider" VARCHAR(30) NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" VARCHAR(64),
    "watermarkApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "RecordExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordEvent_tenantId_recordId_occurredAt_idx" ON "RecordEvent"("tenantId", "recordId", "occurredAt");

-- CreateIndex
CREATE INDEX "RecordEvent_tenantId_occurredAt_idx" ON "RecordEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordParticipant_tokenHash_key" ON "RecordParticipant"("tokenHash");

-- CreateIndex
CREATE INDEX "RecordParticipant_tenantId_recordId_createdAt_idx" ON "RecordParticipant"("tenantId", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordParticipant_tenantId_userId_status_createdAt_idx" ON "RecordParticipant"("tenantId", "userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RecordParticipant_tenantId_email_idx" ON "RecordParticipant"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RecordParticipant_recordId_userId_participantRole_key" ON "RecordParticipant"("recordId", "userId", "participantRole");

-- CreateIndex
CREATE INDEX "RecordAccess_tenantId_userId_idx" ON "RecordAccess"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "RecordAccess_tenantId_recordId_idx" ON "RecordAccess"("tenantId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordAccess_recordId_userId_key" ON "RecordAccess"("recordId", "userId");

-- CreateIndex
CREATE INDEX "RecordComment_tenantId_recordId_createdAt_idx" ON "RecordComment"("tenantId", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordComment_tenantId_recordId_commentScope_idx" ON "RecordComment"("tenantId", "recordId", "commentScope");

-- CreateIndex
CREATE INDEX "RecordComment_tenantId_recordId_isCritical_idx" ON "RecordComment"("tenantId", "recordId", "isCritical");

-- CreateIndex
CREATE INDEX "RecordCommentMention_tenantId_mentionedUserId_isRead_idx" ON "RecordCommentMention"("tenantId", "mentionedUserId", "isRead");

-- CreateIndex
CREATE INDEX "RecordCommentMention_tenantId_recordId_idx" ON "RecordCommentMention"("tenantId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordCommentMention_commentId_mentionedUserId_key" ON "RecordCommentMention"("commentId", "mentionedUserId");

-- CreateIndex
CREATE INDEX "RecordLink_tenantId_fromRecordId_idx" ON "RecordLink"("tenantId", "fromRecordId");

-- CreateIndex
CREATE INDEX "RecordLink_tenantId_toRecordId_idx" ON "RecordLink"("tenantId", "toRecordId");

-- CreateIndex
CREATE INDEX "RecordLink_tenantId_createdAt_idx" ON "RecordLink"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLink_tenantId_linkType_fromRecordId_toRecordId_key" ON "RecordLink"("tenantId", "linkType", "fromRecordId", "toRecordId");

-- CreateIndex
CREATE INDEX "RecordEvidence_tenantId_recordId_createdAt_idx" ON "RecordEvidence"("tenantId", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordEvidence_tenantId_recordId_evidenceType_idx" ON "RecordEvidence"("tenantId", "recordId", "evidenceType");

-- CreateIndex
CREATE INDEX "RecordEvidence_tenantId_objectKey_idx" ON "RecordEvidence"("tenantId", "objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "RecordPayment_recordId_key" ON "RecordPayment"("recordId");

-- CreateIndex
CREATE INDEX "RecordPayment_tenantId_status_idx" ON "RecordPayment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RecordPayment_tenantId_recordId_idx" ON "RecordPayment"("tenantId", "recordId");

-- CreateIndex
CREATE INDEX "RecordPaymentEvidence_tenantId_recordId_createdAt_idx" ON "RecordPaymentEvidence"("tenantId", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordPaymentEvidence_tenantId_paymentId_removedAt_idx" ON "RecordPaymentEvidence"("tenantId", "paymentId", "removedAt");

-- CreateIndex
CREATE INDEX "RecordReminderLog_tenantId_recordId_sentAt_idx" ON "RecordReminderLog"("tenantId", "recordId", "sentAt");

-- CreateIndex
CREATE INDEX "RecordExport_tenantId_recordId_exportType_createdAt_idx" ON "RecordExport"("tenantId", "recordId", "exportType", "createdAt");

-- CreateIndex
CREATE INDEX "Record_tenantId_createdByUserId_createdAt_idx" ON "Record"("tenantId", "createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Record_tenantId_closedAt_idx" ON "Record"("tenantId", "closedAt");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvent" ADD CONSTRAINT "RecordEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvent" ADD CONSTRAINT "RecordEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvent" ADD CONSTRAINT "RecordEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordParticipant" ADD CONSTRAINT "RecordParticipant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAccess" ADD CONSTRAINT "RecordAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAccess" ADD CONSTRAINT "RecordAccess_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAccess" ADD CONSTRAINT "RecordAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAccess" ADD CONSTRAINT "RecordAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordComment" ADD CONSTRAINT "RecordComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordComment" ADD CONSTRAINT "RecordComment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordComment" ADD CONSTRAINT "RecordComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCommentMention" ADD CONSTRAINT "RecordCommentMention_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCommentMention" ADD CONSTRAINT "RecordCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "RecordComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCommentMention" ADD CONSTRAINT "RecordCommentMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_fromRecordId_fkey" FOREIGN KEY ("fromRecordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_toRecordId_fkey" FOREIGN KEY ("toRecordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvidence" ADD CONSTRAINT "RecordEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvidence" ADD CONSTRAINT "RecordEvidence_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvidence" ADD CONSTRAINT "RecordEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvidence" ADD CONSTRAINT "RecordEvidence_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPayment" ADD CONSTRAINT "RecordPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPayment" ADD CONSTRAINT "RecordPayment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPayment" ADD CONSTRAINT "RecordPayment_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPaymentEvidence" ADD CONSTRAINT "RecordPaymentEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPaymentEvidence" ADD CONSTRAINT "RecordPaymentEvidence_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "RecordPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPaymentEvidence" ADD CONSTRAINT "RecordPaymentEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordPaymentEvidence" ADD CONSTRAINT "RecordPaymentEvidence_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordReminderLog" ADD CONSTRAINT "RecordReminderLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordReminderLog" ADD CONSTRAINT "RecordReminderLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordReminderLog" ADD CONSTRAINT "RecordReminderLog_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordExport" ADD CONSTRAINT "RecordExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordExport" ADD CONSTRAINT "RecordExport_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordExport" ADD CONSTRAINT "RecordExport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
