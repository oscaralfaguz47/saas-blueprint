-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_joinedAt_idx" ON "TenantMembership"("tenantId", "joinedAt");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_status_isDefaultTenant_joinedAt_idx" ON "TenantMembership"("userId", "status", "isDefaultTenant", "joinedAt");
