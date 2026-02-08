# Schema vs A2 (Roles and Permissions) Alignment

This document verifies that the Prisma schema and related code align with **docs/epics/2-A2-Roles-And-Permissions.md**.

---

## 1. Data model (schema) — aligned

| A2 / A1 expectation | Schema | Status |
|---------------------|--------|--------|
| `Tenant` (name, slug, status) | `Tenant`: name, slug @unique, status TenantStatus (ACTIVE, SUSPENDED, CLOSED) | OK |
| `TenantMembership` (tenantId, userId, status, joinedAt, isDefaultTenant) | `TenantMembership`: same + lastSeenAt; @@unique([tenantId, userId]) | OK |
| `TenantRole` (per-tenant roles) | `TenantRole`: tenantId, name, isSystem; @@unique([tenantId, name]) | OK |
| `TenantRolePermission` (role ↔ permission) | `TenantRolePermission`: roleId, permissionId; composite PK | OK |
| `TenantUserRole` (membership ↔ role) | `TenantUserRole`: membershipId, roleId; composite PK | OK |
| `Permission` (code, scope) | `Permission`: code @unique, description, scope PermissionScope | OK |
| `AuditLog` | `AuditLog`: actorUserId, actorContext, tenantId, action, metadata, etc. | OK (see note below) |

- **AuditLog.actorUserId**: Canonical rules allow nullable for SYSTEM actor. Schema has `actorUserId String` (required). Optional: change to `String?` if you need to log system actions with no user.
- **RoleKey enum**: Schema has `RoleKey` (ADMIN, MANAGER, MEMBER) on `User.role` (legacy). A2 tenant roles are **TenantRole.name** (e.g. "OWNER", "ADMIN", "FINANCE", "MEMBER"), not RoleKey. No schema change needed for RBAC; RoleKey is legacy.

---

## 2. Roles (A2: OWNER, ADMIN, FINANCE, MEMBER)

- **Schema**: Supports any role name via `TenantRole.name` (string). No enum for tenant roles.
- **Bootstrap**: Must create four system roles per tenant and assign permissions per A2. Aligned in code (see tenancy-bootstrap and seed).

---

## 3. Permission catalog (A2 full list)

- **Schema**: `Permission.code` (unique string) can store all A2 codes.
- **Seed**: Must insert every A2 permission so roles can be linked. Seed and bootstrap updated to match A2.

---

## 4. Indexes and constraints

| Requirement | Schema | Status |
|-------------|--------|--------|
| Tenant.slug unique | @@unique on slug | OK |
| TenantMembership(tenantId, userId) unique | @@unique([tenantId, userId]) | OK |
| TenantRole(tenantId, name) unique | @@unique([tenantId, name]) | OK |
| TenantRolePermission composite PK | @@id([roleId, permissionId]) | OK |
| TenantUserRole composite PK | @@id([membershipId, roleId]) | OK |
| AuditLog by tenant + time | @@index([tenantId, createdAt]) | OK |

---

## 5. Implementation alignment (done)

- **Seed** (`prisma/seed.cjs`): Creates full A2 tenant permission catalog (tenant.audit.read through tenant.payments.manage) plus vendor permissions.
- **Tenancy bootstrap** (`src/server/services/tenancy-bootstrap.ts`): Creates four system roles per tenant (Owner, Admin, Finance, Member) and assigns permissions per A2; uses audit action `tenant.created`.
- **Tenant authorization** (`src/server/security/tenant-authorization.ts`): `TenantPermission` type includes all A2 permission codes; `hasTenantPermission` works with any of them.

---

## 6. Summary

- **Schema structure**: Aligned with A2 (and A1). Tables, relations, and constraints match.
- **Data and code**: Seed, bootstrap, and tenant-authorization are aligned with the full A2 catalog and role definitions.
