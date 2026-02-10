-- A2: Sync Finance role permissions for all existing tenants.
-- Adds tenant.settings.manage, tenant.users.read, tenant.users.invite, tenant.users.disable
-- to the Finance role in every tenant. Idempotent (ON CONFLICT DO NOTHING).
INSERT INTO "TenantRolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "TenantRole" r
CROSS JOIN "Permission" p
WHERE r.name = 'Finance'
  AND p.code IN (
    'tenant.settings.manage',
    'tenant.users.read',
    'tenant.users.invite',
    'tenant.users.disable'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
