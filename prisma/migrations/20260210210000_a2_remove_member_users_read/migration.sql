-- A2: Remove tenant.users.read from MEMBER role for all tenants.
-- MEMBER must have no access to Workspace Settings; they see users only in request context (e.g. select approvers) via ?context=assignment.
DELETE FROM "TenantRolePermission"
WHERE ("roleId", "permissionId") IN (
  SELECT r.id, p.id
  FROM "TenantRole" r
  CROSS JOIN "Permission" p
  WHERE r.name = 'Member' AND p.code = 'tenant.users.read'
);
