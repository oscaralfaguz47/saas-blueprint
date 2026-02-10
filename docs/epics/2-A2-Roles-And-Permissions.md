# A2 — Roles and Permissions (RBAC)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

## 🎯 Epic Objective

Define a **clear, explicit, and enforceable Role-Based Access Control (RBAC)** model for the workspace (tenant), ensuring:

- predictable permissions
- secure separation of concerns
- minimal ambiguity during development
- auditability and compliance readiness

This epic defines **what permissions exist** and **which roles receive them**.

---

## 🧠 RBAC Philosophy

- Permissions are **atomic and explicit**
- Roles are **compositions of permissions**
- No implicit access
- No permission inheritance
- Server-side enforcement only
- UI checks are UX-only

---

## 📚 Permission Catalog

### 🏢 Tenant / Workspace (Administration)

| Permission | Description |
|-----------|------------|
| `tenant.audit.read` | View audit logs (AuditLog) |
| `tenant.billing.manage` | Manage billing, plans, subscriptions |
| `tenant.settings.manage` | Manage workspace settings |
| `tenant.roles.read` | View roles and permissions |
| `tenant.roles.manage` | Create/edit roles and assign permissions |
| `tenant.users.read` | View workspace users |
| `tenant.users.invite` | Invite users to workspace |
| `tenant.users.manage` | Edit/activate/deactivate members |
| `tenant.users.disable` | Disable users (explicit action) |

---

### 📄 Requests

| Permission | Description |
|-----------|------------|
| `tenant.requests.create` | Create requests |
| `tenant.requests.read_all` | View all tenant requests (bypass access rules) |
| `tenant.requests.close` | Close requests (OPEN → CLOSED) |
| `tenant.requests.share` | Share request (create viewer access) |
| `tenant.requests.link` | Link requests (G1 / G2) |
| `tenant.requests.export` | Export request packet (PDF) and/or bundle (ZIP) |
| `tenant.requests.comment` | Add comments on requests |

---

### 📎 Evidence (Request Evidence)

| Permission | Description |
|-----------|------------|
| `tenant.evidence.add` | Attach evidence (files / links) |

---

### ✅ Approvals

| Permission | Description |
|-----------|------------|
| `tenant.approvals.assign_internal` | Assign internal approvers |
| `tenant.approvals.assign_external` | Send external approvals via email/token |
| `tenant.approvals.remind` | Send manual reminders to pending approvers |

---

### 💳 Payments

| Permission | Description |
|-----------|------------|
| `tenant.payments.manage` | Set payment status (NotPaid / Pending / Paid) and manage payment evidence |

---

## 👥 Roles Definition

---

## 👑 OWNER (Workspace Owner)

**Description**  
Full control role. Break-glass access. Cannot be restricted.

### Permissions

#### Tenant
- `tenant.audit.read`
- `tenant.billing.manage`
- `tenant.settings.manage`
- `tenant.roles.read`
- `tenant.roles.manage`
- `tenant.users.read`
- `tenant.users.invite`
- `tenant.users.manage`
- `tenant.users.disable`

#### Requests
- `tenant.requests.create`
- `tenant.requests.read_all`
- `tenant.requests.close`
- `tenant.requests.share`
- `tenant.requests.link`
- `tenant.requests.export`
- `tenant.requests.comment`

#### Evidence
- `tenant.evidence.add`

#### Approvals
- `tenant.approvals.assign_internal`
- `tenant.approvals.assign_external`
- `tenant.approvals.remind`

#### Payments
- `tenant.payments.manage`

---

## 🛠 ADMIN (Workspace Admin)

**Description**  
Manages the workspace operationally, **but does NOT manage billing**.

### Permissions

#### Tenant
- `tenant.audit.read`
- `tenant.settings.manage`
- `tenant.roles.read`
- `tenant.roles.manage`
- `tenant.users.read`
- `tenant.users.invite`
- `tenant.users.manage`
- `tenant.users.disable`

#### Requests
- `tenant.requests.create`
- `tenant.requests.read_all`
- `tenant.requests.close`
- `tenant.requests.share`
- `tenant.requests.link`
- `tenant.requests.export`
- `tenant.requests.comment`

#### Evidence
- `tenant.evidence.add`

#### Approvals
- `tenant.approvals.assign_internal`
- `tenant.approvals.assign_external`
- `tenant.approvals.remind`

#### Payments
- `tenant.payments.manage`

❌ No access to billing / subscription management.

---

## 💼 FINANCE (Finance Role)

**Description**  
Owns the full financial workflow: requests, approvals, payments, exports.  
Does **not** administer the tenant itself.

### Permissions

#### Tenant
- `tenant.audit.read` *(important for compliance)*
- `tenant.settings.manage`
- `tenant.users.read`
- `tenant.users.invite`
- `tenant.users.disable`

#### Requests
- `tenant.requests.create`
- `tenant.requests.read_all`
- `tenant.requests.close`
- `tenant.requests.share`
- `tenant.requests.link`
- `tenant.requests.export`
- `tenant.requests.comment`

#### Evidence
- `tenant.evidence.add`

#### Approvals
- `tenant.approvals.assign_internal`
- `tenant.approvals.assign_external`
- `tenant.approvals.remind`

#### Payments
- `tenant.payments.manage`

❌ No access to:
- roles
- billing config

---

## 👤 MEMBER (Standard Member)

**Description**  
Operational user. Creates requests, collaborates, attaches evidence.  
Cannot close, pay, or export at scale. **No access to Workspace Settings** (no Members/Invites tabs).

### Permissions

#### Requests
- `tenant.requests.create`
- `tenant.requests.share`
- `tenant.requests.link`
- `tenant.requests.comment`

#### Evidence
- `tenant.evidence.add`

#### Approvals
- No assignment permissions  
- Can respond **only if explicitly assigned**

❌ Cannot:
- close requests
- manage payments
- export packets
- access Workspace Settings (Members, Invites, General, Billing)
- manage users or roles

**Listing users for request context:** MEMBER does **not** have `tenant.users.read`. They can load the workspace user list **only in the context of creating/editing requests** (e.g. to select approvers, viewers). The API allows this via `GET /api/tenant/users?context=assignment` when the user has `tenant.requests.create`.

---

## 🔐 Enforcement Rules

- Permissions are enforced **server-side**
- UI visibility ≠ authorization
- All API routes must validate:
  - authentication
  - tenant membership
  - required permission(s)
- No implicit permission inheritance
- No role assumptions

---

## 🧾 Audit Expectations

Changes to:
- roles
- permissions
- assignments

**must** generate AuditLog entries.

---

## 🔄 Syncing role permissions across environments

When you change which permissions a role has (e.g. in `src/lib/tenant-role-permissions.ts`), **existing** tenants only get the new links if you sync. Two approaches:

1. **SQL migration (recommended for production)**  
   Add a migration that inserts the new `TenantRolePermission` rows (see example in `prisma/migrations/*_a2_sync_finance_role_permissions`). Then `prisma migrate deploy` updates every environment (staging, production) when you deploy. No manual step per env.

2. **Deploy pipeline**  
   After `prisma migrate deploy`, run `pnpm run sync:role-permissions`. The script is idempotent, so safe to run on every deploy. Use this if you prefer not to add a migration per permission change.

New workspaces always get the current role–permission set from code at creation time; sync is only for existing tenants.

---

## ✅ Definition of Done (DoD)

This epic is complete when:

- All permissions exist in the system
- All system roles are created
- Permissions are correctly assigned per role
- Enforcement is implemented server-side
- No endpoint bypasses RBAC
- Audit logging is in place for role/permission changes

---

## 🧪 Acceptance Criteria

- OWNER can perform all actions
- ADMIN cannot access billing
- FINANCE can manage settings and invites but cannot manage users or roles
- MEMBER cannot close, pay, or export
- Unauthorized access returns clear errors
- No role escalation is possible via client input


