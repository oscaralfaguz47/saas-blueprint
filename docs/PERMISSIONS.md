# Permissions & Roles Documentation

This document describes the permission system and default roles in the SaaS Blueprint.

## Overview

The application uses a **permission-based RBAC (Role-Based Access Control)** system with two scopes:

1. **Tenant Scope**: Permissions scoped to a specific tenant/workspace
2. **Platform Scope**: Permissions for platform-wide administration

## Permission Scopes

### `PermissionScope` Enum

- `TENANT`: Permission applies only within a tenant context
- `VENDOR`: Permission applies at the platform level
- `BOTH`: Permission can be used in both contexts

## Tenant Permissions

These permissions are scoped to a specific tenant and control what users can do within that workspace.

| Permission Code | Description |
|----------------|-------------|
| `tenant.users.read` | View tenant members and their roles |
| `tenant.users.invite` | Send invitations to join the tenant |
| `tenant.users.manage` | Add/remove members, change roles |
| `tenant.roles.manage` | Create/edit roles and assign permissions |
| `tenant.settings.manage` | Modify tenant settings |
| `tenant.audit.read` | View audit logs for the tenant |
| `tenant.billing.manage` | Manage subscription and billing |

## Platform Permissions

These permissions are scoped to the entire platform and are used by platform administrators.

| Permission Code | Description |
|----------------|-------------|
| `admin.tenants.read` | View all tenants |
| `admin.tenants.suspend` | Suspend or reactivate tenants |
| `admin.users.read` | View all platform users |
| `admin.users.block` | Block or unblock users platform-wide |
| `admin.sessions.revoke` | Force logout users |
| `admin.mfa.reset` | Reset MFA for users |
| `admin.billing.read` | View billing information for all tenants |
| `admin.audit.read` | View platform-wide audit logs |

## Default Tenant Roles

These roles are automatically created for each tenant when it's bootstrapped.

### Owner

**Full access to the tenant.**

Permissions:
- ✅ `tenant.users.read`
- ✅ `tenant.users.invite`
- ✅ `tenant.users.manage`
- ✅ `tenant.roles.manage`
- ✅ `tenant.settings.manage`
- ✅ `tenant.audit.read`
- ✅ `tenant.billing.manage`

**When assigned**: Automatically assigned to the user who creates the tenant.

### Admin

**Manage users and settings (no billing access).**

Permissions:
- ✅ `tenant.users.read`
- ✅ `tenant.users.invite`
- ✅ `tenant.users.manage`
- ✅ `tenant.settings.manage`
- ✅ `tenant.audit.read`

**Use case**: For team leads or managers who need to manage the team but shouldn't have billing access.

### Member

**Read-only access.**

Permissions:
- ✅ `tenant.users.read`

**Use case**: Regular team members who can view the workspace but cannot make changes.

## Default Platform Roles

These roles are created during database seeding and are available platform-wide.

### PlatformAdmin

**Full platform access.**

Permissions:
- ✅ `admin.tenants.read`
- ✅ `admin.tenants.suspend`
- ✅ `admin.users.read`
- ✅ `admin.users.block`
- ✅ `admin.sessions.revoke`
- ✅ `admin.mfa.reset`
- ✅ `admin.billing.read`
- ✅ `admin.audit.read`

**Assignment**: Set via `BOOTSTRAP_ADMIN_EMAIL` environment variable.

### SupportAdmin

**Support operations (no billing or tenant suspension).**

Permissions:
- ✅ `admin.tenants.read`
- ✅ `admin.users.read`
- ✅ `admin.sessions.revoke`
- ✅ `admin.mfa.reset`
- ✅ `admin.audit.read`

**Use case**: Support team members who need to help users but shouldn't suspend tenants or access billing.

### BillingOps

**Billing management only.**

Permissions:
- ✅ `admin.tenants.read`
- ✅ `admin.billing.read`
- ✅ `admin.audit.read`

**Use case**: Finance team members who need to manage billing but shouldn't have access to user management.

### ReadOnlySupport

**Read-only support access.**

Permissions:
- ✅ `admin.tenants.read`
- ✅ `admin.users.read`
- ✅ `admin.audit.read`

**Use case**: Support team members who need to view information but cannot make changes.

## Usage in Code

### Checking Tenant Permissions

```typescript
import { hasTenantPermission } from "@/server/security/tenant-authorization";

const canInvite = await hasTenantPermission({
  userId: user.id,
  tenantId: tenant.id,
  permission: "tenant.users.invite",
});
```

### Requiring Tenant Permissions

```typescript
import { requireTenantPermission } from "@/server/security/workspace-guards";

await requireTenantPermission({
  userId: user.id,
  tenantId: tenant.id,
  permission: "tenant.users.manage",
});
```

### Checking Platform Permissions

```typescript
import { hasVendorPermission } from "@/server/security/vendor-authorization";

const canSuspend = await hasVendorPermission({
  userId: user.id,
  permission: "admin.tenants.suspend",
});
```

## Custom Roles

You can create custom tenant roles with specific permission combinations:

1. Create a new `TenantRole` in the database
2. Assign specific permissions via `TenantRolePermission`
3. Assign the role to users via `TenantUserRole`

Example:

```typescript
// Create a custom "Project Manager" role
const role = await prisma.tenantRole.create({
  data: {
    tenantId: tenant.id,
    name: "Project Manager",
    isSystem: false,
  },
});

// Assign permissions
await prisma.tenantRolePermission.createMany({
  data: [
    { roleId: role.id, permissionId: readUsersPerm.id },
    { roleId: role.id, permissionId: inviteUsersPerm.id },
    { roleId: role.id, permissionId: readAuditPerm.id },
  ],
});
```

## Best Practices

1. **Principle of Least Privilege**: Assign the minimum permissions needed
2. **Use System Roles**: Prefer default roles when they fit your needs
3. **Audit Role Changes**: Log all role and permission changes
4. **Regular Reviews**: Periodically review user roles and permissions
5. **Document Custom Roles**: Document any custom roles you create

## Migration Notes

- The legacy `User.role` field (ADMIN, MANAGER, MEMBER) is kept for backward compatibility
- Platform admins are determined by `VendorUserRole` assignments
- During migration, legacy roles are mapped to permissions (see `vendor-authorization.ts`)
