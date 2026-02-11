-- A2: Grant tenant.billing.manage to Owner role for all existing tenants.
-- Owner has the same permissions as Primary Owner; difference is authority only.
INSERT INTO "TenantRolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "TenantRole" r
CROSS JOIN "Permission" p
WHERE r.name = 'Owner'
  AND p.code = 'tenant.billing.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
