-- CreateIndex
CREATE INDEX "RecordParticipant_tenantId_recordId_participantRole_status__idx" ON "RecordParticipant"("tenantId", "recordId", "participantRole", "status", "revokedAt");

-- CreateIndex
CREATE INDEX "RecordParticipant_tenantId_userId_participantRole_status_idx" ON "RecordParticipant"("tenantId", "userId", "participantRole", "status");
