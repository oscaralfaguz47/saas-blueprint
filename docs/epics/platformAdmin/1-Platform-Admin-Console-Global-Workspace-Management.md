# P1 — Platform Admin Console: Global Workspaces Management

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
> Fully aligned with **A2 — Roles and Permissions (RBAC)** (workspace governance).
> Integrates with **Security 2FA and Sessions — Global Idle Timeout + Remember Device (30/60/90)** and **6-Workspace-Member-Security-Governance.md**.
> Uses **Vendor (platform) RBAC** via `VendorRole`, `VendorUserRole`, and `PermissionScope.VENDOR`.

---

## 🎯 Epic Objective

Deliver a **production-grade Platform Admin Console** that allows **PlatformAdmin** users to:

1) Access a dedicated **Platform Admin** section in the app sidebar (UI gated)
2) View a **global list of all workspaces (tenants)** with efficient filters and cursor pagination
3) Open a **Manage Workspace** view that shows workspace details (read-only) and **emulates Workspace Settings tabs** (Members & Invites)
4) Perform the **same workspace governance operations** as a workspace **Primary Owner** (roles, enable/disable, invites, ownership transfer, member security actions) **without breaking tenant invariants**
5) Perform **break-glass** security action: **reset 2FA for the Primary Owner** of a workspace (PlatformAdmin-only)

This epic must be **secure-by-default**, multi-tenant safe, audit-complete, rate-limited, and index-aware.

---

## 🧠 Philosophy & Non-Negotiables

- **PlatformAdmin is not a workspace role.** It is a **vendor/platform role** (`VendorRole` / `VendorUserRole`).
- Platform Admin APIs are **global** and must never be reachable via tenant permissions.
- UI visibility is **UX-only**. Every platform endpoint enforces:
  - authenticated session
  - **MFA gate** (`requireFullSession(session)`)
  - platform-block checks (`isPlatformBlocked`)
  - **Vendor permission** check (e.g. `admin.tenants.read`)
- PlatformAdmin may bypass **workspace authority hierarchy** (Primary Owner > Owner > Admin > Finance > Member) but must **not bypass tenant invariants**:
  - Exactly one Primary Owner always exists
  - At least one Owner-level user remains active
  - No operation may leave the workspace in an unsafe governance state

---

## 📦 Scope

### ✅ Included
- New sidebar entry + route group for Platform Admin
- Global workspaces list:
  - cursor pagination
  - filters: workspace name, slug, status
  - filter by user(s) membership (combobox search → userIds)
- Manage Workspace view:
  - Read-only workspace profile panel (name, slug, logo, timezone, currency, date format, description)
  - Tabs: Members & Invites (same UX patterns as workspace settings)
- PlatformAdmin operations on a chosen workspace:
  - everything Primary Owner can do in Members/Invites (roles, enable/disable, remove member, resend/revoke invites, transfer primary ownership)
  - member security actions from E6 (force 2FA, reset 2FA, disable 2FA override, revoke sessions, revoke remembered devices)
- Break-glass action:
  - **PlatformAdmin can reset 2FA for Primary Owner** (explicit exception vs A2 hierarchy)
- Audit logging across all platform actions (ActorContext = VENDOR)
- Rate limiting for platform endpoints

### ❌ NOT Included
- Full platform “billing admin” UI
- Cross-tenant impersonation / login-as
- Bulk actions across many tenants (batch suspend, mass revoke, etc.)
- Full platform audit log UI (read-only list can be a later epic)
- A platform “support ticketing” workflow

---

## 🔐 Roles, Permissions & Enforcement

### Vendor role source of truth
Use existing vendor permissions in seed:

- `admin.tenants.read` (required for viewing global workspaces list and manage workspace)
- `admin.users.read` (required for user search + membership filters)
- `admin.sessions.revoke` (if exposing global revoke actions)
- `admin.mfa.reset` (required for break-glass MFA resets)
- `admin.audit.read` (optional: if we add platform audit list later)
- `admin.tenants.suspend` (optional: if we add suspend/reactivate actions later)

### Minimum required permissions for this epic
- List workspaces: `admin.tenants.read`
- Search users for filter: `admin.users.read`
- Open manage workspace: `admin.tenants.read`
- Perform workspace governance actions: `admin.tenants.read` + mapped action requirement (see API section)
- Break-glass reset Primary Owner 2FA: `admin.mfa.reset`

### Global enforcement (mandatory)
All `/api/admin/*` routes:
1) `getServerSession(authOptions)`
2) `requireFullSession(session)` (MFA gate)
3) `if (!session?.user) return ApiErrors.UNAUTHENTICATED()`
4) `if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN()`
5) `assertVendorPermission(session.user.id, "<perm>")`

Prefer **404** for unauthorized access to platform console routes (to reduce discoverability), but return **403** for authenticated platform-blocked users.

---

## 🗺 Routes & UI

### Sidebar
- Show “Platform Admin” item only if the user has vendor permission `admin.tenants.read`.
- Route group: `app/(platform-admin)/admin/*`

### Page 1 — Global Workspaces List
Route: `app/admin/workspaces`

UI requirements:
- Header: “Workspaces”
- Filters (real-time, no search button):
  - Text input: workspace name or slug
  - Status dropdown: ACTIVE / DRAFT / SUSPENDED / CLOSED (optional include “All”)
  - Users filter (multi-select combobox):
    - search by email or name
    - returns userIds
- Table columns:
  - Name
  - Slug
  - Status
  - CreatedAt
  - Primary Owner (optional later)
  - Actions: **Manage Workspace**
- Virtualized infinite scroll (cursor-based fetch, 10–25 per page, max 50)
- Loading / empty / error states per `70-ui-ux-contract.mdc`

Action:
- “Manage Workspace” navigates to: `app/admin/workspaces/[tenantId]`

### Page 2 — Manage Workspace
Route: `app/admin/workspaces/[tenantId]`

Top panel (read-only):
- Workspace Name (large title)
- Slug
- Logo (if exists)
- Timezone
- Currency
- Date Format
- Description

Tabs (must emulate existing Workspace Settings UX):
- Members (same table + filters as workspace settings)
- Invites (same table + filters as workspace settings)

Platform-only banner (always visible):
- “You are in Platform Admin mode. Actions here affect this workspace.”

Break-glass section:
- Only visible when PlatformAdmin has `admin.mfa.reset`
- “Reset Primary Owner 2FA” action appears **only** on the Primary Owner row and/or in a dedicated “Break-glass” card.

---

## 🧾 Data Model (Prisma)

No new tables required for baseline UI, as schema already supports:
- Tenant, TenantMembership, TenantInvitation
- Vendor roles and permissions
- AuditLog actorContext
- UserSecurity, Session, RememberedDevice
- WorkspaceMemberSecurity (if used in E6)

### Required indexes (must exist / confirm)
- `Tenant.slug` unique ✅
- `Tenant.status` indexed ✅
- `TenantMembership`:
  - `@@index([tenantId, status])` ✅
  - `@@index([userId])` ✅
  - `@@index([tenantId, joinedAt])` ✅
- `TenantInvitation`:
  - `@@index([tenantId, email])` ✅
  - `@@index([status])` ✅
- `AuditLog`:
  - `@@index([tenantId, createdAt])` ✅
  - `@@index([actorUserId, createdAt])` ✅
  - `@@index([action, createdAt])` ✅

Optional future performance (not required for this epic):
- trigram / full-text indexes for name/slug (Postgres extension) if needed later

---

## 🔎 Query & Filter Rules (Performance)

### Global workspace list query rules
- Always use `select` (no broad `include`)
- Always apply cursor pagination:
  - Order by `createdAt DESC, id DESC`
  - Cursor uses `{ createdAt, id }` composite logic (or stable `id` cursor with consistent order)
- Filters:
  - `q` applies to `name ILIKE %q%` OR `slug ILIKE %q%`
  - `status` exact match
  - `userIds[]` filter:
    - return tenants where `TenantMembership.userId IN userIds` AND membership status ACTIVE (configurable)
- Enforce max page size (e.g. 25; max 50)

### User search query rules
- Separate endpoint for combobox:
  - limit 10–20 results
  - `q` matches `email ILIKE` OR `name ILIKE`
  - return minimal shape: `{ id, name, email }`

---

## 🔐 Governance & Security Operations (PlatformAdmin)

PlatformAdmin actions must:
- Validate the target tenant exists
- Validate membership/target user exists **within that tenant** for tenant-scoped actions
- Enforce tenant invariants (Primary Owner uniqueness, at least one Owner-level active) **even for PlatformAdmin**
- Be audited with actorContext `VENDOR` and include `tenantId` of target

### Authority handling
- PlatformAdmin bypasses tenant hierarchy checks (rank actor > rank target) for workspace operations.
- Tenant invariants remain enforced.

---

## 🧨 Break-glass: Reset Primary Owner 2FA (PlatformAdmin-only)

### Why
Primary Owner can be locked out (lost phone + backup codes). Workspace cannot self-recover safely without platform-level intervention.

### Rules
- Only Vendor permission: `admin.mfa.reset`
- Only for Primary Owner of a given tenant (the primary owner membership role)
- Requires step-up:
  - `mfaVerifiedAt` must be within last 10 minutes, else 403 `STEP_UP_REQUIRED`
- Requires destructive confirmation (client enforced UX + server idempotency):
  - Typed confirm string: `RESET 2FA`

### Behavior (transaction)
Target: `UserSecurity` for Primary Owner userId

- Clear:
  - `totpSecretEnc = null`
  - `totpPendingSecretEnc = null`
  - `backupCodeHashes = []`
  - `backupCodesGeneratedAt = null`
  - `totpEnabled = false`
  - `mfaEnabled = false` (if used)
- Set:
  - `mfaResetAt = now`
  - `forceLogoutAt = now`
- Revoke:
  - all `RememberedDevice` for that user (`revokedAt = now`)
  - all `Session` for that user (`revokedAt = now`, `logoutReason = "platform_mfa_reset"`)

Result:
- Next login requires MFA setup again (if enforced by workspace security policy / global rules).

Audit key:
- `admin.workspace.primary_owner.mfa_reset`

---

## 🧩 Integration with Workspace Member Security (E6)

Platform admin “Members” tab must surface:
- `WorkspaceMemberSecurity.mfaEnforced` (if using per-workspace enforcement)
- `UserSecurity.totpEnabled` (actual configured state)

PlatformAdmin may execute all E6 actions on any member including Owners/Primary Owner, but:
- **Reset Primary Owner 2FA** must still be treated as break-glass:
  - only via platform endpoint
  - requires `admin.mfa.reset`
  - requires step-up + typed confirm

---

## 🔌 API Endpoints — Contract (Platform Admin)

**Base path:** `/api/admin`

All endpoints:
- Must use `requireFullSession(session)`
- Must verify vendor permission(s)
- Must use Zod for query/body/params
- Must return standard error shape

### 1) Search users (for filters)
`GET /api/admin/users/search?q=...&limit=10`

Permissions:
- `admin.users.read`

Response:
```json
{
  "data": {
    "items": [
      { "id": "cuid", "name": "Jane Doe", "email": "jane@x.com" }
    ]
  }
}

Validation:

- q: required, 2–120 chars

- limit: optional, 1–20 (default 10)

Rate limit:

- 60/min per actor (combobox)

2) List workspaces (cursor pagination)

GET /api/admin/workspaces?cursor=...&limit=25&q=...&status=ACTIVE&userIds=cuid,cuid

Permissions:

- admin.tenants.read

Query:

- cursor: optional (opaque or { createdAt, id } encoded)
- limit: 1–50 (default 25)
- q: optional (name/slug)
- status: optional enum
- userIds: optional CSV list of userIds (max 10)

Response:
{
  "data": {
    "items": [
      { "id": "tenantId", "name": "Los Patitos", "slug": "los-patitos", "status": "ACTIVE", "createdAt": "..." }
    ],
    "nextCursor": "..."
  }
}

Rate limit:

30/min per actor

Required indexes:

- Tenant(status)
- TenantMembership(userId)
- TenantMembership(tenantId, status)

3) Workspace summary (read-only header panel)

GET /api/admin/workspaces/:tenantId

Permissions:

- admin.tenants.read

Response:

{
  "data": {
    "id": "tenantId",
    "name": "Los Patitos",
    "slug": "los-patitos",
    "status": "ACTIVE",
    "logoObjectKey": null,
    "timezone": "America/Costa_Rica",
    "currency": "USD",
    "dateFormat": "MM/DD/YYYY",
    "description": "..."
  }
}
Rate limit:
- 60/min per actor

4) Emulated Members list (same filters as workspace settings)

GET /api/admin/workspaces/:tenantId/members?cursor=...&limit=25&q=...&role=...&status=ACTIVE

Permissions:
- admin.tenants.read (and optionally admin.users.read if needed)
- Must return the same shape used by workspace settings members table plus security fields:
- membershipId, userId, name, email, status, joinedAt
- role label(s)
- isPrimaryOwner (derived)
- mfaEnforced (workspace scope if used)
- totpEnabled (global configured)

Rate limit:

- 30/min per actor

5) Emulated Invites list (same filters as workspace settings)

GET /api/admin/workspaces/:tenantId/invites?cursor=...&limit=25&q=...&status=PENDING

Permissions:
- admin.tenants.read

Rate limit:
- 30/min per actor

6) Workspace governance mutations (proxy to existing logic)

Important rule: PlatformAdmin must re-use the same service methods used by workspace settings endpoints, but with a platform-authorized path and different auth gate.

Example endpoints (mirror existing, do not duplicate logic):

- POST /api/admin/workspaces/:tenantId/invites (create invite)
- POST /api/admin/workspaces/:tenantId/invites/:inviteId/revoke
- PATCH /api/admin/workspaces/:tenantId/members/:membershipId/role
- PATCH /api/admin/workspaces/:tenantId/members/:membershipId/status (enable/disable)
- POST /api/admin/workspaces/:tenantId/transfer-primary-owner
Permissions:

- admin.tenants.read (baseline) PLUS:
- For disabling/blocking users: admin.users.block if it affects global user flags
- For session revocation: admin.sessions.revoke
- For MFA reset: admin.mfa.reset

Governance invariants:
- Must enforce:
exactly 1 Primary Owner
at least 1 Owner-level active
cannot leave tenant without active owners

Errors:
- 409 GOVERNANCE_CONSTRAINT_VIO-LATION when invariants would break

Rate limit:
- 10/min per actor for mutations

Audit keys:
- Mirror workspace audit keys but with actorContext=VENDOR and action prefix admin.workspace.*

7) Break-glass reset Primary Owner 2FA

POST /api/admin/workspaces/:tenantId/break-glass/reset-primary-owner-2fa

Permissions:
- admin.mfa.reset
- admin.tenants.read

Body:
{ "confirm": "RESET 2FA" }

Validation:
- confirm must equal "RESET 2FA" else 400 VALIDATION_ERROR

Step-up:
- Must require recent MFA (≤10 min) else 403 STEP_UP_REQUIRED

Behavior:
- reset user security as described above
- revoke sessions + remembered devices

Response:
{ "data": { "ok": true } }

Rate limit:
- 3/min per actor

Audit:
- admin.workspace.primary_owner.mfa_reset
- metadata allowed: { tenantId, targetUserId, reason: "break_glass" }
- never include tokens/secrets/codes

📜 Audit Logging (Mandatory)

All platform admin actions must:
**Write AuditLog with:
- actorUserId = platformAdminUserId
- actorContext = VENDOR
- tenantId = target tenantId (when action relates to a tenant)
- action = <canonical key>
- targetType + targetId (tenant, membership, invitation, user, etc.)
- targetUserId when applicable
- safe metadata only (no secrets)

Canonical action keys (minimum):
- admin.workspaces.list_viewed (optional; can be noisy, skip if you prefer)
- admin.workspace.viewed
- admin.workspace.members.list_viewed (optional; can be noisy)
- admin.workspace.invites.list_viewed (optional; can be noisy)
- admin.workspace.member.role_changed
- admin.workspace.member.status_changed
- admin.workspace.invite.created
- admin.workspace.invite.revoked
- admin.workspace.primary_owner.transferred
- admin.workspace.member.sessions_revoked
- admin.workspace.member.remembered_devices_revoked
- admin.workspace.member.mfa_forced
- admin.workspace.member.mfa_reset
- admin.workspace.member.mfa_disabled
- admin.workspace.primary_owner.mfa_reset (break-glass)

🚦 Rate Limiting (Platform Admin)

- /api/admin/users/search → 60/min
- /api/admin/workspaces → 30/min
- /api/admin/workspaces/:id → 60/min
- /api/admin/workspaces/:id/members → 30/min
- /api/admin/workspaces/:id/invites → 30/min
- All mutations under /api/admin/workspaces/:id/ → 10/min
- Break-glass reset Primary Owner 2FA → 3/min

Return:
- 429 RATE_LIMITED

🧪 Edge Cases

- User is authenticated but not PlatformAdmin → 404 (or 403 per policy)
- User is platform-blocked → 403
- Tenant not found → 404
- Member/invite not found in that tenant → 404
- Attempted mutation would violate invariants → 409 GOVERNANCE_CONSTRAINT_VIOLATION
- Step-up missing/expired for break-glass → 403 STEP_UP_REQUIRED
- Any route called with PENDING_MFA session → 401 with details.code = "MFA_REQUIRED" (via requireFullSession)
- Cross-tenant leakage is impossible:
  - All tenant-specific queries must include tenantId = :tenantId
  - Membership joins must include tenantId
- Concurrency:
  - Use transactions for invariant-sensitive operations (ownership transfer, role changes that impact owner-level)
  - Use deterministic ordering and unique constraints to prevent duplicate primary owner states

  📊 Performance Notes

- Prefer select over include
- No N+1:
  - For members list: join membership → user → roles using batched queries
- Cursor pagination mandatory
- Enforce max page size
- Use indexes listed above
- For user filter:
  - Do not join massive datasets without constraints
  - Limit userIds to max 10

  ✅ Definition of Done

- Platform Admin sidebar entry gated by vendor permission
- Global Workspaces list implemented:
  - cursor pagination
  - filters (name/slug/status/userIds)
  - infinite scroll
- Manage Workspace page implemented:
  - read-only workspace panel
  - Members tab and Invites tab (emulating workspace settings)
- Platform Admin endpoints implemented under /api/admin/:
  - enforce requireFullSession
  - enforce vendor permissions
  - Zod validation everywhere
  - rate limiting
  - audit logging with actorContext=VENDOR
- Workspace governance mutations reuse shared service logic and enforce tenant invariants
- Break-glass reset Primary Owner 2FA implemented:
  - PlatformAdmin-only (admin.mfa.reset)
  - step-up required
  - typed confirmation
  - revokes sessions + remembered devices
  - audited
- No secrets logged or stored
- Build passes (types + lint)
- Security review checklist passes (authz, idor, mfa gate, rate limits)

✅ Acceptance Criteria

A PlatformAdmin sees “Platform Admin” in sidebar; non-PlatformAdmin does not.
- PlatformAdmin can list all workspaces with filters and infinite scroll; results are paginated and stable.
- PlatformAdmin can open a workspace and view read-only workspace details.
- PlatformAdmin can view Members and Invites tabs for that workspace and perform the same operations a Primary Owner can, while invariants are enforced.
- PlatformAdmin can reset Primary Owner 2FA via break-glass flow (confirm + step-up), and the Primary Owner must re-enroll 2FA on next login.
- All platform admin actions are audited with actorContext=VENDOR and scoped tenantId where applicable.
- Unauthorized access to /api/admin/ is blocked server-side (no UI reliance).
- No cross-tenant data leakage is possible.