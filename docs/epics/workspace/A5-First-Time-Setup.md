# A5 — First-Time Setup & Invitation Lifecycle (Zero-Friction, Multi-Workspace Aware)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

> This epic supersedes the previous "Invite-Aware Auto-Create" logic and restructures onboarding to:
> - Separate **onboarding (no workspace)** from **membership lifecycle (invitations)**
> - Eliminate unnecessary friction
> - Remove email-blocked acceptance once authenticated
> - Support multiple invitations
> - Prevent accidental auto-workspace creation

---

# 🎯 Epic Objective

Deliver a frictionless, production-grade onboarding and invitation system that guarantees:

1. Users are never blocked unnecessarily.
2. Invitations never force email-return if user is authenticated.
3. Workspace creation only happens when truly needed.
4. Multiple invitations are supported simultaneously.
5. Onboarding and membership management are clearly separated.
6. Users can belong to multiple workspaces.
7. Zero ambiguity in routing logic.

---

# 🧠 Core UX Principle

Onboarding answers:
> “Do you have access to any workspace?”

Invitations answer:
> “Do you want to join additional workspaces?”

These are different lifecycle states and must not be mixed.

---

# 🧭 Global Decision Matrix (Server-Side Routing Logic)

After authentication, resolve:

- activeMembershipCount
- pendingInvitationsCount

### Decision Rules:

```
IF activeMembershipCount === 0:
    IF pendingInvitationsCount > 0:
        → Redirect to /setup/choose
    ELSE:
        → Redirect to /setup/workspace
ELSE:
    → Redirect to /requests (main app)
```

Invitations NEVER block access if user already has at least one ACTIVE workspace.

---

# 🧩 New Onboarding Structure

We introduce a clean separation:

## 1️⃣ Setup Choice Page
Route:
`/setup/choose`

Purpose:
Displayed only when:
- user has 0 active workspaces
- AND has ≥1 pending invitations

This replaces forcing `/invite?token=...`

---

### Setup Choice UI Requirements

Title:
**Choose how you want to start**

Section 1 (Primary Block):
List of pending invitations (cards)

Each invitation card shows:
- Workspace name
- Invited by
- Role offered
- Accept button
- Decline button

Accept:
- Attach membership
- Set as default workspace
- Redirect to `/requests`

Decline:
- Mark invite as rejected
- Continue showing remaining invites
- If no remaining invites → redirect to `/setup/workspace`

Divider

Section 2:
“Or create your own workspace”

CTA:
Create Workspace → `/setup/workspace`

---

## 2️⃣ Claim Workspace Page
Route:
`/setup/workspace`

Shown only when:
- user has 0 active memberships
- AND no pending invitations
OR
- user explicitly chooses to create workspace from choose screen

Purpose:
Claim slug for a DRAFT workspace.

---

# 🔁 Auto-Workspace Creation Logic (Rewritten)

Auto-creation of DRAFT workspace happens ONLY when:

```
activeMembershipCount === 0
AND
pendingInvitationsCount === 0
```

It does NOT happen:
- when user has pending invitations
- when user has active memberships
- when invite is accepted
- when invite is declined (unless no other invites exist)

---

# 📨 Invitation Lifecycle (Rewritten)

Invitations are no longer treated as onboarding.

They are part of membership lifecycle.

---

## 1️⃣ Invite Acceptance via Link

Route:
`/invite?token=RAW_TOKEN`

Behavior:

If unauthenticated:
→ Authenticate → then continue

If authenticated:
- Validate token
- Validate email match
- Show Accept / Decline

Accept:
- Attach membership
- Switch workspace
- Redirect to `/requests`

Decline:
- Mark rejected
- If no active workspaces → redirect `/setup/choose` or `/setup/workspace`
- If has active workspaces → redirect `/requests`

---

## 2️⃣ Invitations for Existing Users

If user logs in and:
- activeMembershipCount ≥ 1
- pendingInvitationsCount ≥ 1

DO NOT redirect.

Instead:

Display persistent notification in app layout:

Header badge:
"You have X pending workspace invitations"

Click →
Route:
`/invitations`

---

# 📂 Invitations Management Page

Route:
`/invitations`

Shows:
Active Workspaces (top section)
Pending Invitations (second section)

Accept:
- Join workspace
- Optional: auto-switch
- Toast confirmation

Decline:
- Mark rejected
- Remove from list

No forced redirects.

---

# 🏗 Workspace Status Model

### Tenant Status

- `DRAFT`
- `ACTIVE`

### DRAFT Meaning

Workspace exists but:
- cannot access production features
- must be claimed (slug chosen)

Only possible when:
- auto-created for brand new user with no invites

---

# 🔐 Authorization Rules

### Claim Workspace

- Authenticated required
- Must be OWNER of DRAFT workspace
- Workspace resolved server-side
- Never trust client tenantId

Errors:
- 401
- 403
- 404 (no DRAFT workspace)
- 409 (slug taken)
- 429 (rate limit)

---

### Accept Invitation

- Must be authenticated
- Email must match invite emailNormalized
- If mismatch:
  - show error
  - allow logout/switch
- If already member:
  - redirect `/requests`

---

# 🗃 Data Model Requirements

## Tenant

Required:
- id
- slug (unique CI)
- name
- status (DRAFT | ACTIVE)
- createdByUserId
- claimedAt
- createdAt
- updatedAt

Indexes:
- UNIQUE lower(slug)
- (createdByUserId)
- (status)
- (createdByUserId, status)

---

## TenantMembership

Required:
- tenantId
- userId
- role
- status (ACTIVE | DISABLED)
- isDefaultTenant
- joinedAt

Indexes:
- UNIQUE (tenantId, userId)
- (userId)
- (tenantId, status)
- (tenantId, role)
- (userId, status, isDefaultTenant, joinedAt)

---

## TenantInvitation

Must support:
- status (PENDING | ACCEPTED | REJECTED | REVOKED | EXPIRED)
- rejectedAt (nullable)
- rejectedByUserId (nullable)

Raw tokens must never be logged.

---

# 🧾 Audit Events

Canonical keys:

- WORKSPACE_AUTO_CREATED
- WORKSPACE_CLAIMED
- TENANT_INVITE_ACCEPTED
- TENANT_INVITE_REJECTED
- INVITE_EMAIL_MISMATCH
- ONBOARDING_REDIRECTED_TO_CHOOSE

Metadata:
- tenantId
- actorUserId
- invitationId
- result
- previousSlug/newSlug (claim)

---

# 🔌 API Endpoints

### GET /api/workspaces/check-slug

- Zod validation
- Rate limited
- Returns:
  `{ available: boolean }`

Errors:
- 400 VALIDATION_ERROR
- 429 RATE_LIMITED

---

### POST /api/workspaces/claim

Payload:
```json
{ "slug": "string" }
```

Transactional:
- validate slug
- ensure availability
- DRAFT → ACTIVE
- set claimedAt
- ensure isDefaultTenant true
- commit

---

### POST /api/invitations/:id/accept

Transactional:
- validate invite
- attach membership
- set default workspace
- mark invite ACCEPTED

---

### POST /api/invitations/:id/reject

Transactional:
- mark invite REJECTED
- audit event

---

# ✅ Acceptance Criteria

### New User, No Invitations

- Registers
- DRAFT workspace auto-created
- Redirect to `/setup/workspace`
- Claims slug
- Workspace ACTIVE
- Redirect `/requests`

---

### New User With Invitations

- Registers
- No auto-workspace created
- Redirect `/setup/choose`
- Accept → join workspace → `/requests`
- Decline all → `/setup/workspace` → auto-create DRAFT

---

### Existing User With Invitations

- Logs in
- Goes directly to `/requests`
- Sees invitation notification badge
- Can manage via `/invitations`
- No forced redirect

---

### Invite Via Link

- Authenticate
- Accept → join + switch → `/requests`
- Reject → fallback based on membership count

---

# 🧪 Tests Must Cover

- 0 workspace + 0 invites
- 0 workspace + 1 invite
- 0 workspace + multiple invites
- active workspace + pending invites
- accept invite via link
- decline invite via link
- invite email mismatch
- revoked invite
- DRAFT claim
- slug conflict
- default workspace switching

---

# 🏁 Definition of Done

- Server-side routing logic updated
- Onboarding separated from invitation lifecycle
- `/setup/choose` implemented
- Invitations notification system implemented
- No forced email-return after authentication
- Auto-workspace only created when strictly necessary
- Audit events logged
- All indexes present
- No unsafe client trust
- No token leakage
- Build passes
- Types pass
- E2E flows validated
