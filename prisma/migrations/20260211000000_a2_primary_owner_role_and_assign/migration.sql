-- A2: Add Primary Owner role to every tenant and assign it to one Owner per tenant.
-- Ensures exactly one Primary Owner per workspace for existing tenants.
-- Idempotent: ON CONFLICT DO NOTHING where applicable.

-- 1) Create "Primary Owner" role for each tenant that does not have it.
INSERT INTO "TenantRole" (id, "tenantId", name, "isSystem")
SELECT gen_random_uuid()::text, t.id, 'Primary Owner', true
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "TenantRole" r
  WHERE r."tenantId" = t.id AND r.name = 'Primary Owner'
);

-- 2) Assign Primary Owner role to one Owner membership per tenant (earliest joined).
-- Skips tenants that already have at least one Primary Owner.
INSERT INTO "TenantUserRole" ("membershipId", "roleId")
SELECT "membershipId", "roleId"
FROM (
  SELECT m.id AS "membershipId", r_po.id AS "roleId",
    ROW_NUMBER() OVER (PARTITION BY m."tenantId" ORDER BY m."joinedAt" ASC NULLS LAST) AS rn
  FROM "TenantMembership" m
  JOIN "TenantUserRole" tur ON tur."membershipId" = m.id
  JOIN "TenantRole" r_owner ON r_owner.id = tur."roleId" AND r_owner.name = 'Owner'
  JOIN "TenantRole" r_po ON r_po."tenantId" = m."tenantId" AND r_po.name = 'Primary Owner'
  WHERE m.status = 'ACTIVE'
) sub
WHERE rn = 1
ON CONFLICT ("membershipId", "roleId") DO NOTHING;
