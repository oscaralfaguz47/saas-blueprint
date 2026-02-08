# A1 — Workspace (Tenant)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

# 🎯 Epic Objective

Allow an authenticated user to create a **valid, consistent, and secure workspace (tenant)** that becomes immediately operational in the system, including:

- Active membership
- Correct OWNER role assignment
- Minimal audit trail
- Full transactional safety
- Modal-first UX for creation
- Immediate in-modal transition to Workspace Settings
- Automatic workspace switch after creation
- Secure logo upload using Cloudflare R2

---

# 📦 Scope

## ✅ Included

- Modal-based workspace creation (no static page)
- Creation requires only:
  - `slug`
- Server-side derived:
  - `name`
- `status = ACTIVE`
- Creation of `TenantMembership`
- Assignment of OWNER role
- Audit event: `tenant.created`
- Workspace visible in selector
- Auto-switch to newly created workspace
- Modal transforms into "Workspace Settings"
- Editable fields:
  - `logo`
  - `name`
  - `timezone`
  - `currency`
  - `dateFormat`
  - `description`
- Secure logo upload to Cloudflare R2
- Audit event for logo updates

---

## ❌ Explicitly NOT Included

- Invitations (A2)
- Billing / Plan logic (J1)
- Suspension logic
- Manual tenant deletion

---

# 🪟 Modal-First UX Flow

## Create Workspace

- Clicking "Create Workspace" opens a modal
- Only required field:
  - `slug`

### After Successful Creation

- Modal remains open
- Modal title becomes: `Workspace Settings`
- Success message appears:
  - `Workspace created successfully. You can update settings now.`
- Active workspace automatically switches
- No redirect occurs

---

# 🔗 Slug Rules

- Required
- Lowercase
- Hyphen-separated
- Alphanumeric only
- No special characters
- Server-side normalization
- Globally UNIQUE (DB constraint)

### Duplicate Handling

- Clear user-friendly error
- No silent retries
- No partial DB writes

Example message:

```
That workspace URL is already taken. Please choose a different slug.
```

---

# 🏷 Name Derivation

- `Tenant.name` is derived from slug on creation
  - `acme-inc` → `Acme Inc`
- Editable later in settings

---

# ⚙️ Workspace Settings Defaults

On first open after creation:

- `timezone`
  - Prefill from browser
  - Fallback: `UTC`
- `currency`
  - Prefill from locale
  - Fallback: `USD`
- `dateFormat`
  - Default: `MM/DD/YYYY`
- `logo`
  - null
- `description`
  - null

Persist only on explicit save.

---

# 👤 Creator Membership Rules

When a tenant is created:

- Create `TenantMembership`
- Set:
  - `status = ACTIVE`
  - `joinedAt = now()`
  - `isDefaultTenant = true` only if user has no other default tenant
- Assign OWNER role via `TenantUserRole`

A tenant CANNOT exist without an OWNER.

---

# 🔄 Transaction Rules

All creation steps must occur inside ONE database transaction:

1. Create Tenant
2. Create TenantMembership
3. Assign OWNER role
4. Insert AuditLog (`tenant.created`)

If any step fails:
- Full rollback
- No partial writes

Auto-switch and modal transition occur only after successful commit.

---

# 🧱 Data Model Expectations

Authoritative tables:

- `Tenant`
- `TenantMembership`
- `TenantRole`
- `TenantRolePermission`
- `TenantUserRole`
- `AuditLog`

Tenant additional field:

- `logoObjectKey` (nullable string)

Do NOT store full public URLs in DB.

---

# 🖼 Logo Upload — Cloudflare R2

## Storage Requirements

- Use Cloudflare R2
- Private bucket recommended
- No public write access

---

## Object Structure

```
tenants/{tenantId}/logo/{randomHash}.{ext}
```

Rules:

- Never use original filename
- Always generate random secure name
- Store only object key in DB

Example:

```
tenants/abc123/logo/9f8a7c6d.webp
```

---

# 🔐 Secure Upload Flow (Signed URL Pattern)

### Step 1 — Request Upload URL

Endpoint:

```
POST /api/tenants/{tenantId}/logo/upload-url
```

Server must:

- Validate RBAC permission
- Validate tenant context
- Generate short-lived signed PUT URL (5–10 min TTL)
- Return:
  - `uploadUrl`
  - `objectKey`

---

### Step 2 — Direct Upload to R2

Client uploads directly to R2 using signed URL.

No file passes through application server.

---

### Step 3 — Confirm Upload

Endpoint:

```
POST /api/tenants/{tenantId}/logo/confirm
```

Server must:

- Verify object exists in R2
- Validate size and metadata
- Update `Tenant.logoObjectKey`
- Insert audit log:
  - `tenant.logo.updated`

---

# 🛡 Logo Validation Rules

## Client-Side Validation

- Allowed MIME types:
  - image/png
  - image/jpeg
  - image/webp
- Max file size: 2MB
- Min dimensions: 64x64
- Max dimensions: 2048x2048
- Prevent double submission

---

## Server-Side Validation (Authoritative)

Before generating signed URL:

- Validate:
  - MIME type
  - File size
  - Extension whitelist

On confirm:

- Verify object exists
- Validate metadata
- Reject invalid uploads

Never trust client MIME type or extension.

---

# 🔁 Logo Replacement Rules

When uploading new logo:

- Old object may be deleted (recommended)
- DB update must be atomic
- Insert audit event

---

# 🧾 Audit Logging

## Required Events

### tenant.created

| Field | Value |
|-------|--------|
| action | tenant.created |
| actorUserId | creator |
| actorContext | TENANT |
| tenantId | new tenant |

### tenant.logo.updated

| Field | Value |
|-------|--------|
| action | tenant.logo.updated |
| actorUserId | updating user |
| tenantId | tenant |

Audit logging is mandatory.

---

# 📊 Indexes & Constraints

## Required

- `Tenant.slug` → UNIQUE
- `TenantMembership(tenantId, userId)` → UNIQUE

## Indexes for performance (A1 and workspace flows)

- **Tenant**: `@@index([status])` — used when resolving default tenant and in duplicate-name checks.
- **TenantMembership**:
  - `@@index([userId])` — list workspaces for user, resolve default tenant.
  - `@@index([tenantId, status])` — membership lookup by tenant and status; permission checks.
  - `@@index([tenantId, joinedAt])` — workspace users list ordered by `joinedAt`.
  - `@@index([userId, status, isDefaultTenant, joinedAt])` — default-tenant lookup (`getDefaultTenantForUser`, `ensureDefaultTenantForUser`) and workspace list with `orderBy isDefaultTenant desc, joinedAt desc` (GET /api/tenant).

All tenant-scoped queries use indexed columns (tenantId, userId, status) for efficiency.

---

# ⚠️ Edge Cases

## Input Validation

- Empty slug → error
- Too long slug → error
- Invalid characters → error

---

## Concurrency

Two simultaneous slug attempts:

- DB constraint is source of truth
- One succeeds
- One fails cleanly

---

## Multi-Workspace Rules

- User may belong to multiple tenants
- User may create multiple tenants
- Only ONE `isDefaultTenant = true`

---

## Security

If:

- `User.isPlatformBlocked = true`
  - return 403
- Unauthenticated
  - return 401

---

# ✅ Definition of Done (DoD)

Workspace creation is complete only if:

- Tenant exists
- Membership exists
- OWNER assigned
- Audit log exists
- Appears in selector
- Create flow opens as modal
- Modal transitions to settings after create
- Auto-switch works
- Settings fields visible
- Settings persist correctly
- Logo securely uploads to R2
- Object key stored correctly
- Signed URL expires
- No insecure file handling exists

---

# 📣 Events

- tenant.created
- tenant.logo.updated

No additional events in this epic.

---

# 🛠 Implementation Notes

- Must enforce RBAC
- Must not trust client data
- Must use server-side tenant resolution
- Must use signed R2 uploads
- Must keep modal open during auto-switch
- No background jobs required (cleanup optional future enhancement)

---
