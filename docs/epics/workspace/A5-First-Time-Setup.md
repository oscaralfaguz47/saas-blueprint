# A5 — First-Time Setup: Auto-Create OR Claim Workspace (Invite-Aware Onboarding)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

> This epic **adapts** existing:
> - **A1** Workspace (Tenant) creation + slug rules + membership OWNER creation + audit
> - **A3** Tenant Membership Invites (token-based) + members/roles + audit

---

## 🎯 Epic Objective

Deliver a professional, minimal-friction first-time onboarding system that ensures:

1) Every newly registered user ends up with a valid “home” context:
- either an **invited workspace** (if they accept an invite),
- or their **own auto-created workspace** in **DRAFT** state that must be claimed.

2) Invite-first onboarding:
- Invited users without an account should see the **Invite Acceptance** experience (not forced to create/claim their own workspace first).
- If invite is rejected or revoked/invalid → user falls back to onboarding to create/claim their own workspace.

3) Production access is blocked until:
- the user is in an **ACTIVE** workspace (invited workspace is typically already ACTIVE), OR
- they successfully **claim** their own DRAFT workspace to become ACTIVE.

---

## ✅ Core Behavioral Requirements (Must Match Product Rules)

### Rule A — Non-invited new user
- If user registers without an invite context:
  - auto-create a workspace (status = `DRAFT`) + OWNER membership
  - redirect to `/setup/workspace` to claim slug

### Rule B — Invited new user (no account yet)
- If user registers via a valid invite flow (invite token context exists):
  - show invite acceptance UI (`/invite?token=...`) after authentication/signup
  - if user **accepts**:
    - attach membership to invited workspace
    - set invited workspace as default (auto-switch)
    - redirect to main app page: **Requests**
    - DO NOT auto-create a workspace for them
  - if user **rejects**:
    - create their own auto workspace (status = DRAFT) + OWNER membership
    - redirect to `/setup/workspace`

### Rule C — Invite revoked/invalid/expired
- If invited user has no valid invite to accept (revoked/expired/invalid):
  - fall back to onboarding (auto-create DRAFT workspace) + redirect to `/setup/workspace`

### Rule D — Invite accepted (no auto-workspace)
- If user accepts an invite and joins a workspace:
  - do not auto-create their own workspace
  - they can create additional workspaces later using existing A1 flow (manual create)

### Rule E — Always auto-switch + redirect
- Whenever invite is accepted successfully:
  - auto-switch to that workspace
  - redirect user to **Requests** as the default landing.

---

## 📦 Scope

### ✅ Included

- Invite-aware onboarding decision logic (server-side)
- Auto-create workspace on first registration **only if needed**
- Temporary slug generation for auto-created workspaces
- Workspace status = `DRAFT` for auto-created workspaces
- Claim flow to transition `DRAFT → ACTIVE`
- Invite acceptance UI flow that takes precedence over onboarding
- Reject invite flow that triggers onboarding (auto workspace)
- Revoked/invalid invite fallback to onboarding
- Middleware + server-side guards:
  - if pending invite → route to invite acceptance page
  - else if current workspace is DRAFT → route to `/setup/workspace`
- Standard errors (60-api-validation-errors.mdc)
- Required indexes + constraints
- Rate limiting on slug check endpoint
- Canonical audit events for:
  - auto-created workspace
  - claimed workspace
  - invite accepted
  - invite rejected (new)
  - onboarding fallback due to invalid invite (optional but recommended)

### ❌ NOT Included

- Multi-workspace onboarding wizard beyond the above rules
- Slug change after activation (future epic)
- Billing activation logic
- Plan upgrades
- Logo upload in onboarding (still supported by A1/A3 but blocked while DRAFT)
- Member invitations management UI changes (A3 covers this)

---

## 🧭 High-Level Flow Summary

### Entry Points
- Standard registration: `/auth/signup`
- OAuth callback: `/auth/callback/*`
- Invite link: `/invite?token=RAW_TOKEN`

### Post-auth routing priority (server-side enforced)
1) If user has a **pending invite context** that is still valid → force `/invite?token=...`
2) Else if user’s current/default workspace is `DRAFT` → force `/setup/workspace`
3) Else → allow production routes (Requests is main landing)

---

## 🧠 Key Concepts / Definitions

### Workspace Status
- `DRAFT`: workspace exists but cannot access production features; must be claimed (slug chosen).
- `ACTIVE`: production-ready workspace.

### Pending Invite Context (PIC)
A short-lived server-side state indicating:
- “This user is currently in an invite-acceptance journey.”

It can be represented by:
- secure HTTP-only cookie (recommended), OR
- server session entry keyed by userId, OR
- short-lived signed token stored in cookie

Must include:
- `rawInviteToken` OR a stable reference that can be used to validate the invite after login
- `emailNormalized` (optional) for user feedback
- expiration / TTL

Never store raw token in logs.

---

## 🗺 Routes / Pages

### 1) Invite Acceptance Page
Route:
- `/invite?token=RAW_TOKEN`

Behavior:
- If unauthenticated → show “Sign in / Create account” and continue after auth
- If authenticated:
  - Validate token
  - If valid and email matches authenticated user → show Accept / Reject
  - If token invalid/expired/revoked → show fallback message + CTA “Continue setup” → `/setup/workspace`
  - If already member → “You already belong” + “Go to Requests”

Accept outcome:
- join workspace
- set as default
- switch workspace
- redirect to `/requests` (or your canonical main route)

Reject outcome:
- mark invite as rejected for auditing (does not need to revoke)
- create own DRAFT workspace (if user has no ACTIVE memberships)
- redirect to `/setup/workspace`

### 2) Claim Workspace Page
Route:
- `/setup/workspace`

Purpose:
- Claim workspace slug for user’s DRAFT workspace.

Outcome:
- `DRAFT → ACTIVE`
- auto-switch to claimed workspace
- redirect to `/requests`

---

## 🔐 Authorization / Security Rules

### Workspace Claim
- Must be authenticated
- Must have `OWNER` role in the DRAFT workspace being claimed
- Workspace resolved server-side from membership; never trust client workspaceId

Return codes:
- 401 unauthenticated
- 403 not OWNER
- 404 no DRAFT workspace found for user
- 409 slug taken
- 429 rate limited

### Invite Acceptance
- Token-based public entry is allowed to view invite page, but:
  - acceptance requires authentication
  - authenticated user email must match invite emailNormalized
- If logged in with a different email:
  - show mismatch UI
  - allow logout/switch
  - do not accept

---

## 🧱 Data Model Requirements (Prisma / Postgres)

### Tenant (Workspace)
Required fields (ensure exist / add if missing):
- `id`
- `slug` (string, unique case-insensitively)
- `name`
- `status` (`DRAFT | ACTIVE`)
- `createdByUserId` (required)
- `claimedAt` (nullable)
- `createdAt`
- `updatedAt`

Constraints / Indexes:
- Unique index on `lower(slug)` (case-insensitive)
- `status NOT NULL`
- `createdByUserId NOT NULL`
- Indexes:
  - `(createdByUserId)`
  - `(status)`
  - `(createdByUserId, status)`

### TenantMembership
- `tenantId`
- `userId`
- `status` (`ACTIVE | DISABLED`)
- `role` (`OWNER | ADMIN | FINANCE | MEMBER`)
- `isDefaultTenant` (boolean) (already in A1 rules)
- `joinedAt`

Constraints / Indexes:
- UNIQUE `(tenantId, userId)`
- Indexes:
  - `(userId)`
  - `(tenantId, status)`
  - `(tenantId, role)`
  - `(userId, status, isDefaultTenant, joinedAt)` (recommended; aligns with A1)

### TenantInvitation (A3)
No structural changes required, but W1 depends on:
- ability to validate invite status: active vs revoked/expired/accepted
- ability to accept/reject

Recommended addition (optional but useful):
- `rejectedAt` nullable timestamp
- `rejectedByUserId` nullable (for auditing)
If you do not add columns, rejection is tracked only in AuditLog.

---

## 🧾 Audit Logging

Canonical action keys (append-only):

- `WORKSPACE_AUTO_CREATED`
- `WORKSPACE_CLAIMED`
- `TENANT_INVITE_ACCEPTED` (maps to `tenant.invite.accepted` in A3 if you prefer)
- `TENANT_INVITE_REJECTED` (new)
- `ONBOARDING_FALLBACK_INVALID_INVITE` (optional but recommended)

Required metadata:
- `tenantId` where relevant
- `actorUserId`
- For claim:
  - `previousSlug`
  - `newSlug`
  - `statusFrom`, `statusTo`
- For invite accepted/rejected:
  - `invitationId`
  - `invitedEmail`
  - `result: accepted|rejected`
  - `reason` (if invalid invite fallback)

Never store raw tokens.

---

## 🔗 Slug Rules (Claim)

Validation via Zod:

- min 3 chars
- max 32 chars
- lowercase only
- letters, numbers, hyphens
- no leading hyphen
- no trailing hyphen
- no consecutive hyphens
- must not match reserved list

Reserved slugs (minimum):
- admin
- api
- app
- billing
- settings
- support
- www
- setup
- invite
- workspace
- requests

On conflict:
- HTTP 409
- error code: `SLUG_TAKEN`

---

## 🔌 API Endpoints

### 1) Check Slug Availability
`GET /api/workspaces/check-slug?slug=abc`

Rules:
- Zod validate query param
- Rate limit (429 with `RATE_LIMITED`)
- Return `{ available: true|false }`
- Do not leak tenant details

Errors:
- 400 VALIDATION_ERROR
- 429 RATE_LIMITED

---

### 2) Claim Workspace
`POST /api/workspaces/claim`

Payload:
```json
{ "slug": "string" }


✅ Acceptance Criteria
Non-invited registration

Given a new user (no invite)
When registration completes
Then a DRAFT workspace is auto-created
And user is OWNER
And user is redirected to /setup/workspace

Invited registration + accept

Given a user with no account who arrives via a valid invite
When they create an account and accept the invite
Then they join that workspace
And the workspace becomes default (auto-switch)
And they are redirected to /requests
And no auto-workspace is created for them

Invited registration + reject

Given a user with no account who arrives via a valid invite
When they create an account and reject the invite
Then they are redirected to /setup/workspace
And a DRAFT workspace is auto-created for them (OWNER)

Invited registration + revoked invite

Given a user with no account who arrives via an invite that is revoked/expired/invalid
When they authenticate
Then they are redirected to /setup/workspace
And a DRAFT workspace is auto-created for them (OWNER)

Claim workspace

Given a DRAFT workspace
When user claims a valid available slug
Then workspace becomes ACTIVE
And redirect to /requests

✅ Definition of Done (DoD)

Invite-aware onboarding decision logic implemented server-side

Non-invited users: auto-create DRAFT workspace on registration

Invited users:

see invite acceptance flow first (after signup/auth)

accept → join invited workspace, default switch, redirect /requests, no auto-workspace

reject → auto-create DRAFT workspace + redirect /setup/workspace

revoked/invalid → auto-create DRAFT workspace + redirect /setup/workspace

Middleware + server guards enforce priority:

pending invite → /invite

DRAFT workspace → /setup/workspace

Claim flow:

slug validation (Zod)

availability check with rate limiting

DRAFT → ACTIVE transition in a single transaction

Audit events created:

WORKSPACE_AUTO_CREATED

WORKSPACE_CLAIMED

TENANT_INVITE_ACCEPTED

TENANT_INVITE_REJECTED

Required indexes created

Standard error shapes and HTTP codes correct

Tests cover:

invite accept/reject flows

revoked/expired invite fallback

non-invited auto-create flow

DRAFT redirect guards

slug validation + conflict

default workspace switching on invite accept

Build passes, types pass, no unsafe client trust