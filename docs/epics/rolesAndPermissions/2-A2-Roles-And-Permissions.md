# A2 — Roles and Permissions (RBAC)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

## 🎯 Epic Objective

Define a **clear, explicit, and enforceable Role-Based Access Control (RBAC)** model for the workspace (tenant), ensuring:

- predictable permissions
- secure separation of concerns
- minimal ambiguity during development
- auditability and compliance readiness
- **robust governance for self-serve B2B workspaces (Primary Owner model)**

This epic defines **what permissions exist** and **which roles receive them**, plus the **governance constraints** that prevent abuse, lockouts, or privilege wars.

---

## 🧠 RBAC Philosophy

- Permissions are **atomic and explicit**
- Roles are **compositions of permissions**
- No implicit access
- No permission inheritance
- Server-side enforcement only
- UI checks are UX-only
- **Authority checks apply on top of permissions for user/role management (hierarchy matters)**

---

## 👑 Ownership & Governance Model (Hardening)

### ✅ Roles Hierarchy (Authority Order)

**Primary Owner > Owner > Admin > Finance > Member**

This hierarchy applies to **role changes, disabling/enabling users, and sensitive admin operations**.

---

### ✅ Primary Owner (Workspace Primary Owner)

There must be **exactly one** Primary Owner per workspace.

Primary Owner governance rules:

- Full authority over the workspace (including billing)
- Can manage any role (including Owners)
- Can transfer Primary Ownership
- Cannot be removed/demoted/disabled in a way that violates workspace safety constraints

---

### 🔒 Governance Safety Constraints (Server-enforced)

These constraints must be enforced across all relevant endpoints (invites, role changes, enable/disable, membership removal):

1. **Exactly one Primary Owner must exist at all times**
2. **At least one Owner-level user must exist at all times**
   - Owner-level users = Primary Owner + Owners
3. **No action can leave the workspace without an active Primary Owner**
4. **No action can leave the workspace with zero active Owner-level users**
5. **No privilege escalation is possible via client input**
   - Requested role assignments must be validated against the actor’s authority

---

## ✉️ Invite Default Role Rule (Self-serve)

**All invites, regardless of who creates them (Primary Owner, Owner, Admin, Finance), create a membership with default role = `Member`.**

Role assignment occurs **after invite acceptance**, via role update flows that enforce hierarchy rules.

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
| `tenant.users.invite` | Invite users to workspace *(invite defaults to Member)* |
| `tenant.users.manage` | Edit/activate/deactivate members *(authority constraints apply)* |
| `tenant.users.disable` | Disable users (explicit action) *(authority constraints apply)* |

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

## 👑 PRIMARY OWNER (Workspace Primary Owner)

**Description**  
Full control role. Break-glass access. **Cannot be restricted.**  
Primary billing owner and ultimate authority.

### Permissions

#### Tenant
- `tenant.audit.read`
- `tenant.billing.manage`
- `tenant.settings.manage`
- `tenant.roles.read`
- `tenant.roles.manage`
- `tenant.users.read`
- `tenant.users.invite` *(invite defaults to Member)*
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

**Governance Notes**
- Exactly one Primary Owner per workspace.
- Only Primary Owner can change Owner-level membership (promote/demote Owners).
- Primary Owner transfer must be protected (see Governance Operations).

---

## 👑 OWNER (Workspace Owner)

**Description**  
**Same permissions as Primary Owner.** Owner **can** manage billing. The only difference is **authority** (governance): Owner **cannot** manage Owners (promote/demote Owner-level roles) and **cannot** initiate Primary Owner transfer.

### Permissions (identical to Primary Owner)

#### Tenant
- `tenant.audit.read`
- `tenant.billing.manage`
- `tenant.settings.manage`
- `tenant.roles.read`
- `tenant.roles.manage`
- `tenant.users.read`
- `tenant.users.invite` *(invite defaults to Member)*
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

**Authority Notes (governance only)**
- Can change roles and enable/disable **Admin, Finance, Member**
- Cannot manage Owner-level roles (promote/demote Owners)
- Cannot transfer Primary Ownership

---

## 🛠 ADMIN (Workspace Admin)

**Description**  
Manages the workspace operationally, **but does NOT manage billing**.  
Can manage Finance (per hierarchy) and Members.

### Permissions

#### Tenant
- `tenant.audit.read`
- `tenant.settings.manage`
- `tenant.roles.read`
- `tenant.roles.manage`
- `tenant.users.read`
- `tenant.users.invite` *(invite defaults to Member)*
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

**Authority Notes**
- Can change roles and enable/disable **Finance and Member**
- Cannot manage Admin peers
- Cannot manage Owner-level roles

---

## 💼 FINANCE (Finance Role)

**Description**  
Owns the full financial workflow: requests, approvals, payments, exports.  
Can invite users (default Member) and manage Members **only** (per hierarchy).

### Permissions

#### Tenant
- `tenant.audit.read` *(important for compliance)*
- `tenant.settings.manage`
- `tenant.users.read`
- `tenant.users.invite` *(invite defaults to Member)*
- `tenant.users.disable` *(authority constraints apply; Finance can affect Members only)*
- `tenant.users.manage` *(authority constraints apply; Finance can affect Members only)*

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
- billing config
- managing roles above Finance
- managing roles/permissions for the workspace beyond allowed hierarchy actions

**Authority Notes**
- Can change role and enable/disable **Members only**
- Cannot manage Finance peers
- Cannot manage Admin, Owner, or Primary Owner

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

## 🔐 Authority Rules (User Management & Role Changes)

Permissions enable **capability**, but **authority** controls **who can affect whom**.

### ✅ Management Rules (Hierarchy-Enforced)

Given actor role `A` and target role `T`, changes are allowed only if:

- `rank(A) > rank(T)` (strictly greater)
- AND workspace safety constraints are preserved

Where rank order is:

**Primary Owner (5) > Owner (4) > Admin (3) > Finance (2) > Member (1)**

### Examples

- Admin can change Finance → ✔
- Finance can change Admin → ❌
- Admin can disable Admin peer → ❌
- Owner can change Admin/Finance/Member → ✔
- Owner can change Owner → ❌
- Only Primary Owner can promote/demote Owners → ✔

---

## 🔒 Governance Operations (Required)

### 1) Transfer Primary Ownership

Transfer Primary Owner is a special operation requiring:

- Re-authentication
- Explicit confirmation
- AuditLog entry
- Notification to existing Owner-level users
- Ensure exactly 1 Primary Owner remains

### 2) Owner-level Role Changes

Any change that promotes/demotes to/from Owner-level roles must enforce:

- At least 1 active Owner-level user remains
- Primary Owner uniqueness preserved

---

## 🔐 Enforcement Rules

- Permissions are enforced **server-side**
- UI visibility ≠ authorization
- All API routes must validate:
  - authentication
  - tenant membership
  - required permission(s)
  - **authority (hierarchy over target role)**
  - **workspace safety constraints**
- No implicit permission inheritance
- No role assumptions
- Never trust client-provided role changes

---

## 🧾 Audit Expectations

Changes to:
- roles
- permissions
- assignments
- user disabled/enabled
- ownership transfer

**must** generate AuditLog entries.

Audit log entries must include:
- actorId
- targetId (if any)
- action key
- before/after (where applicable)

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
- All system roles are created (Primary Owner, Owner, Admin, Finance, Member)
- Permissions are correctly assigned per role
- Enforcement is implemented server-side
- Authority checks enforce hierarchy on all user management actions
- Workspace safety constraints are enforced (Primary Owner uniqueness, at least 1 Owner-level user)
- Audit logging is in place for role/permission changes and governance operations

---

## 🧪 Acceptance Criteria

- Primary Owner can perform all actions (including billing and Owner-level management)
- Owner can manage Admin/Finance/Member, but cannot access billing or manage Owners
- Admin cannot access billing and cannot manage Admin peers, but **can manage Finance and Members**
- Finance can manage settings and invites, can **manage Members only**, and cannot manage Finance peers or higher roles
- MEMBER cannot close, pay, or export
- All invites default to Member role regardless of inviter
- Unauthorized access returns clear errors
- No role escalation is possible via client input
- Workspace never ends up without exactly 1 Primary Owner
- Workspace never ends up with zero Owner-level users
