# A1 — Workspace (Tenant)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

## 🎯 Epic Objective

Allow an authenticated user to create a **valid, consistent, and secure workspace (tenant)** that becomes immediately operational in the system, including:

- active membership
- correct role assignment
- minimal audit trail
- full transactional safety

---

## 📦 Scope

### ✅ Included

- Create a **Tenant (Workspace)** with:
  - `name`
  - unique `slug`
  - `status = ACTIVE`
- Create **TenantMembership** for the creator
- Assign creator membership attributes:
  - `status = ACTIVE`
  - `joinedAt = now()`
  - `isDefaultTenant = true` **only if** the user has no other default tenant
- Assign initial role to creator:
  - **OWNER**
- Create audit event:
  - `action = tenant.created`
- Tenant becomes visible in the user’s tenant selector

---

### ❌ Explicitly NOT Included

- Tenant invitations (see **A2 – Tenant Membership Invites**)
- Plan assignment or billing logic (see **J1 – Pricing / Plan Config**)
- Tenant suspension or manual admin actions
- Manual tenant deletion

---

## 📐 Business Rules

### 🔗 Tenant Slug

- Generated automatically from tenant name
- Normalization rules:
  - lowercase
  - spaces replaced with `-`
  - no special characters
- Must be **globally unique** (DB constraint)

#### Slug Collision Handling
- If slug already exists:
  - return a **clear, user-friendly error**
  - **no silent retries**
  - **no partial creation**

**Example error message**


---

### 🚦 Initial Tenant State

- `Tenant.status = ACTIVE`
- No `DRAFT` tenant state exists in the system

---

### 👤 Creator Membership Rules

When a tenant is created:

- A **TenantMembership** is created for the creator
- Membership attributes:
  - `status = ACTIVE`
  - `joinedAt = now()`
  - `isDefaultTenant`:
    - `true` only if the user has no other default tenant
    - otherwise `false`

⚠️ A user can belong to multiple tenants but can only have **one default tenant**.

---

### 🔐 Initial Role Assignment (Mandatory)

- The creator **must** receive:
  - Role: **OWNER**
- Role assignment is done via:
  - `TenantUserRole`

❗ This is **NOT optional**.  
A tenant **cannot exist** without an OWNER.

---

## 🧱 Data Model Expectations

The following tables are **authoritative** for this epic:

- `Tenant`
- `TenantMembership`
- `TenantRole`
- `TenantRolePermission`
- `TenantUserRole`
- `AuditLog`

No alternative tables or shortcuts are allowed.

---

## 🔄 Transaction Rules

Tenant creation **must occur in a single database transaction**, including:

1. Create `Tenant`
2. Create `TenantMembership`
3. Assign OWNER role (`TenantUserRole`)
4. Insert `AuditLog` entry

If **any step fails**:
- the entire transaction **rolls back**
- **no partial data** is persisted

---

## 🧾 Audit Logging

### Required Audit Event

| Field | Value |
|------|------|
| action | `tenant.created` |
| actorUserId | creator user |
| actorContext | `TENANT` |
| tenantId | newly created tenant |
| metadata | optional |

Audit creation is **mandatory**.

---

## ✅ Definition of Done (DoD)

A tenant is considered **successfully created** only if **all** of the following are true:

- ✅ Tenant record exists
- ✅ TenantMembership exists for creator
- ✅ OWNER role is assigned to creator
- ✅ Tenant status is `ACTIVE`
- ✅ Tenant appears in user’s tenant selector
- ✅ AuditLog entry exists with:
  - `action = tenant.created`
  - `actorUserId = creator`
  - `tenantId = new tenant`
- ✅ All operations occurred inside a single transaction

---

## 🧪 Acceptance Criteria

### 😊 Happy Path

**Given**
- an authenticated user

**When**
- the user creates a tenant with a valid name

**Then**
- tenant is created with `ACTIVE` status
- membership is created
- user is assigned as OWNER
- tenant is selectable by the user
- audit log is recorded

---

### 🚫 Duplicate Slug

**Given**
- a slug that already exists

**When**
- the user attempts to create a tenant

**Then**
- the operation fails
- a clear error is returned
- **no records** are created

---

## ⚠️ Edge Cases

### Input Validation
- Empty name → error
- Name exceeds max length → error
- Generated slug invalid → error

---

### Concurrency
- Two simultaneous requests with the same slug:
  - DB constraint is the source of truth
  - one succeeds
  - one fails cleanly

---

### Multi-Workspace Rules
- A user can:
  - belong to multiple tenants
  - create multiple tenants
- A user can have:
  - **only one** `isDefaultTenant = true`

---

### Security
- If `User.isPlatformBlocked = true`:
  - tenant creation is forbidden
  - return `403 Forbidden`
- Unauthenticated request:
  - return `401 Unauthorized`

---

## 📊 Indexes & Constraints (Required)

- `Tenant.slug` → `UNIQUE`
- `TenantMembership(tenantId, userId)` → `UNIQUE`

---

## 📣 Events (Closed Scope)

- `tenant.created`

No additional events are emitted in this epic.

---

## 🛠 Implementation Notes

- Must use server-side tenant resolution
- Must enforce RBAC inside the API handler
- Must not trust client-provided tenant data
- No background jobs required

---

