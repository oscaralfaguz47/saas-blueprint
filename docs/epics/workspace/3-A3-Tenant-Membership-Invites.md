# A3 — Tenant Membership Invites (and Member Management)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

## 🎯 Epic Objective

Enable workspace administrators to manage tenant access by:

- inviting users by email with a secure, token-based flow
- accepting invites for existing and new users (signup-first)
- preventing duplicate memberships (DB constraints as truth)
- supporting member lifecycle controls (disable/enable)
- supporting role changes (Owner/Admin/Finance/Member)
- ensuring full auditability across all critical actions
- delivering a clean, user-friendly UI for managing members and invites

---

## 📦 Scope

### ✅ Included

- **Workspace Settings as a page** (modal removed)
- Invite user to tenant via email
- Generate cryptographically random invitation token (store only **hash**)
- Invitation expiration handling
- Accept invitation (public token-based, validated server-side):
  - existing user → attach membership / reactivate if disabled
  - new user → signup flow then auto-attach membership
- Resend invitation email (same token) for active invites
- Re-invite (new token) for expired/revoked invites
- Revoke invitation
- Disable / enable existing tenant member
- Change member role (Owner/Admin/Finance/Member)
- Audit logging for all critical actions
- Basic anti-abuse protections (rate limiting, non-leaky errors)

---

### ❌ Explicitly NOT Included

- Bulk invites
- SCIM / directory sync
- Auto-accept domain-based invites
- Custom role definitions (fixed roles only in v1)
- Granular per-resource permissions (handled by RBAC in another epic)

---

## 🔐 Roles & Permissions Required

### Roles (workspace membership roles)

- `OWNER`
- `ADMIN`
- `FINANCE`
- `MEMBER`

### Permissions

| Action | Required Permission |
|------|----------------------|
| View members & invites | `tenant.users.read` |
| Invite user | `tenant.users.invite` |
| Revoke invite | `tenant.users.invite_manage` |
| Resend invite | `tenant.users.invite_manage` |
| Disable/enable member | `tenant.users.manage` |
| Change member role | `tenant.users.manage_roles` |
| Accept invite | Public (token-based), validated server-side |

> Notes:
> - `OWNER` implicitly has all tenant.* permissions.
> - `ADMIN` and `FINANCE` permissions are defined in the RBAC epic; this epic only enforces permission checks above.

---

## 📐 Business Rules

---

### ✉️ Invitation Creation

When inviting a user by email:

- Create `TenantInvitation` with:
  - `tenantId`
  - `emailNormalized` (lowercase + trimmed; provider-specific normalization optional)
  - `tokenHash` (never store raw token)
  - `expiresAt`
  - `invitedByUserId`
  - `revokedAt = null`
  - `acceptedAt = null`
- Send invitation email containing:
  - tenant name
  - invite link with **raw token**
  - invited email (displayed for clarity)
- **Only one active invitation per (tenantId, emailNormalized)** is allowed.

If an active invitation already exists:
- return clear error (UI-friendly)
- do NOT create duplicates

**Active invitation definition:**
- `acceptedAt IS NULL`
- `revokedAt IS NULL`
- `expiresAt > now()`

---

### 🔑 Token Security

- Token must:
  - be cryptographically random (≥ 128 bits entropy recommended)
  - be generated server-side
  - be hashed before storage using a modern hash (e.g., SHA-256)
- Token is:
  - single-use
  - invalid after expiration
  - invalid after acceptance
  - invalid after revocation
- The system must never log raw tokens.

---

### ⏳ Expiration Rules

- Expired invitations:
  - cannot be accepted
  - return explicit user-facing error
- No silent reactivation
- Re-invite requires **new invitation + new token** (or reusing the same record but regenerating token is allowed only if prior invite is not active; see "Re-invite").

---

### 👤 Invitation Acceptance Flow

Invitation acceptance is **public token-based**, but membership creation requires server-side verification.

#### Case 1 — Existing User (email exists)

If invited email matches an existing user:

- If `TenantMembership` does not exist:
  - Create `TenantMembership` with:
    - `status = ACTIVE`
    - `role = MEMBER` (default)
    - `joinedAt = now()`
- If `TenantMembership` exists and is `DISABLED`:
  - Reactivate:
    - `status = ACTIVE`
    - keep `joinedAt` unchanged
    - set `reEnabledAt = now()` (optional column) OR omit and rely on audit logs
- If `TenantMembership` exists and is already `ACTIVE`:
  - Do not modify membership
  - Return friendly UI state: "You already belong to this workspace"

Then:
- Mark invitation as `acceptedAt = now()`

---

#### Case 2 — New User (email does not exist)

If invited email does not exist:

- Redirect to signup flow
- After successful signup:
  - auto-attach membership using the same acceptance transaction rules
- The invitation token is consumed only once

---

### 📧 Email Enforcement (Anti-Abuse, Pro SaaS Standard)

- The invitation is bound to **one specific email**.
- To accept an invitation:
  - the authenticated user's email must match `emailNormalized`
- If the user is logged in with a different email:
  - show a clear mismatch message
  - provide logout/switch account action
  - do not accept

---

### 🚫 Duplicate Membership Prevention

- A user cannot have more than one membership per tenant.
- DB constraint is the source of truth:
  - `TenantMembership(tenantId, userId)` → UNIQUE
- If user already belongs to tenant:
  - acceptance returns friendly message
  - no duplicate membership is created

---

### 🧑‍🦽 Disable / Enable Member

Disabling a member:

- Updates `TenantMembership.status = DISABLED`
- Does NOT delete:
  - membership
  - audit history
- User immediately loses access to tenant

Enabling a member:

- Updates `TenantMembership.status = ACTIVE`
- Does NOT change role
- Should be logged in audit log

---

### 🧩 Change Member Role (Owner/Admin/Finance/Member)

Changing role:

- Allowed roles: `OWNER`, `ADMIN`, `FINANCE`, `MEMBER`
- Requires permission: `tenant.users.manage_roles`
- Rules:
  - Cannot remove the **last OWNER** from a tenant.
  - Actor cannot change their own role from OWNER to non-OWNER if they are the last OWNER.
  - Changing role does not affect membership `status`.

Default role on acceptance:
- Always `MEMBER` in v1.

---

## 🧾 Audit Logging

### Required Audit Events

| Action | Audit `action` |
|------|----------------|
| Invite created | `tenant.user.invited` |
| Invite resent | `tenant.invite.resent` |
| Invite revoked | `tenant.invite.revoked` |
| Invite accepted | `tenant.invite.accepted` |
| Member disabled | `tenant.user.disabled` |
| Member enabled | `tenant.user.enabled` |
| Member role changed | `tenant.user.role_changed` |
| Member re-enabled via invite acceptance | `tenant.user.reenabled` |

Each audit log must include:
- `actorUserId` (nullable for public acceptance step only if not yet authenticated; once authenticated, must be present)
- `tenantId`
- `action`
- target identifiers (e.g., `targetUserId`, `targetEmail`, `invitationId`)
- minimal metadata (role changes, previous/new status)

---

## 🔄 Transaction Rules (Critical)

Invitation acceptance must occur in **one DB transaction**:

1. Validate raw token (hash + lookup)
2. Validate token is not revoked/accepted
3. Validate expiration
4. Require authenticated user (or complete signup then continue)
5. Validate authenticated user email matches invite email
6. Create or update membership (create/activate/reactivate)
7. Mark invitation as accepted
8. Insert AuditLog

❗ If any step fails → full rollback (no partial membership, no partial acceptance)

---

### 🧵 Concurrency Rules (Concurrent Accept Attempts)

Acceptance must be concurrency-safe:

- In the transaction, perform an atomic update of the invitation with a guard:
  - Update where `acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now()`
  - If affected rows ≠ 1 → treat as already consumed / invalid
- Membership UNIQUE constraint ensures no duplicates even under race.

---

## ✅ Definition of Done (DoD)

This epic is complete when:

- Workspace Settings is implemented as a page with tabs/subnav:
  - General / Members / Invites / Billing
- Invitations are securely created with token + expiration
- Invitation emails are sent correctly
- Accepting an invite:
  - attaches user to tenant (or shows friendly "already member")
  - assigns default role `MEMBER` for new memberships
  - re-enables membership if it was disabled
  - prevents duplicates
- Expired / revoked / consumed tokens are rejected
- Resend and Re-invite behaviors are correct
- Member disabling/enabling works correctly and immediately affects access
- Role changes work (Owner/Admin/Finance/Member), with "last owner" guard
- All actions are logged in AuditLog
- No partial data can exist (atomic acceptance)

---

## 🧪 Acceptance Criteria

### Invite Creation

**Given**
- a user with `tenant.users.invite`

**When**
- inviting `user@example.com`

**Then**
- `TenantInvitation` is created
- `tokenHash` + `expiresAt` exist
- invite is active & unique per (tenantId, emailNormalized)
- email is sent

---

### Resend Invite (Active)

**Given**
- an active invitation exists

**When**
- admin clicks "Resend"

**Then**
- email is sent again
- token is unchanged
- audit log `tenant.invite.resent` is created

---

### Re-invite (Expired/Revoked)

**Given**
- an invitation is expired or revoked

**When**
- admin clicks "Re-invite"

**Then**
- a new token is generated (new tokenHash)
- invite becomes active again (new record or updated record)
- email is sent
- audit log is created

---

### Expired Token

**Given**
- an expired invitation

**When**
- user attempts acceptance

**Then**
- acceptance fails
- clear user-facing error is returned
- no membership is created/modified

---

### Existing Membership (Active)

**Given**
- user already belongs to tenant (ACTIVE)

**When**
- invite is accepted

**Then**
- operation does not create duplicates
- user sees friendly message: "You already belong to this workspace"
- invitation is still consumed or not? (see rule below)

**Rule (recommended):**
- If already ACTIVE member, do NOT consume the invite; show message and provide "Go to workspace".
- Admin can revoke it later if desired.

---

### Existing Membership (Disabled)

**Given**
- user belongs to tenant but membership is DISABLED
- invite is active

**When**
- invite is accepted

**Then**
- membership is re-enabled (ACTIVE)
- audit log `tenant.user.reenabled` is created
- invitation is marked accepted

---

### Change Role

**Given**
- admin/owner has `tenant.users.manage_roles`

**When**
- changing member role to `FINANCE`

**Then**
- role is updated
- audit `tenant.user.role_changed` is created
- "last owner" guard is enforced

---

## ⚠️ Edge Cases

### Security

- Token brute force attempts → rate-limited
- Invalid token → generic error (no leakage)
- Platform-blocked users cannot accept invites
- Token must never be stored/logged in raw form

### Data Integrity

- Concurrent acceptance attempts → only one succeeds
- Invitation cannot be reused
- Email mismatch:
  - logged-in user email != invited email → show mismatch UI, do not accept

---

## 📊 Postgres Indexes & Constraints (Required)

### TenantInvitation

- `UNIQUE (tokenHash)`
- `INDEX (tenantId)`
- `INDEX (emailNormalized)`
- `INDEX (expiresAt)`

**Partial unique index to enforce one ACTIVE invite per (tenantId, emailNormalized):**
- `UNIQUE (tenantId, emailNormalized) WHERE acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now()`

### TenantMembership

- `UNIQUE (tenantId, userId)`
- `INDEX (tenantId, status)`
- `INDEX (tenantId, role)`

---

## 🖥 UI/UX Specification (Workspace Settings Page)

### IA / Navigation

Sidebar:
- Requests
- Workspace switcher (current workspace)
- Workspace settings
- Billing

Workspace Settings (page):
- Header: "Workspace Settings"
- Tabs/Subnav:
  - **General**
  - **Members**
  - **Invites**
  - **Billing** (existing route; may link out)

---

### General Tab

Fields:
- Logo (upload + preview)
- Name
- Timezone (dropdown)
- Currency (dropdown)
- Date format (dropdown)
- Description (textarea)

Actions:
- Primary: Save changes
- Secondary: Cancel/Reset

UX:
- Inline validation
- Toast on save success/failure
- Optimistic UI optional (not required)

---

### Members Tab

Primary CTA:
- **Invite people** (opens Invite modal)

Members table columns:
- User (avatar + name + email)
- Role (chip: Owner/Admin/Finance/Member)
- Status (Active/Disabled)
- Joined
- Actions (⋯)

Row actions:
- Change role (dropdown)
- Disable member (confirm modal)
- Enable member (confirm modal)
- Copy email

Guards:
- If target is the last OWNER:
  - Disable and role downgrade actions are blocked with clear tooltip/error.

Empty state:
- Friendly text: "Invite teammates to collaborate in this workspace."
- CTA: Invite people

---

### Invites Tab

Invites table columns:
- Email
- Status (Active/Expired/Revoked/Accepted)
- Invited by
- Invited at
- Expires at
- Actions (⋯)

Row actions:
- Resend (ACTIVE only)
- Revoke (ACTIVE only)
- Re-invite (EXPIRED/REVOKED only)
- Copy invite email (optional)

Empty state:
- "No invitations yet."
- CTA: Invite people

---

### Invite Modal

Title:
- "Invite to {WorkspaceName}"

Fields:
- Email input
- Helper text: "They’ll receive an email to join this workspace."

Actions:
- Primary: Send invite
- Secondary: Cancel

Errors:
- If active invite exists → show inline: "An active invite already exists for this email."

---

### Accept Invite Page (Public)

Route:
- `/invite?token=RAW_TOKEN`

States:
1. Loading: "Validating invitation…"
2. Invalid/Expired/Revoked:
   - "This invitation link is no longer valid."
   - CTA: "Contact your workspace admin for a new invite."
3. Valid token:
   - If not logged in:
     - "Join {WorkspaceName}"
     - Buttons: Sign in / Create account
   - If logged in but email mismatch:
     - "This invite was sent to invited@email.com, but you're signed in as other@email.com."
     - CTA: Sign out and continue
   - If logged in and email matches:
     - CTA: "Join workspace"
4. Already member:
   - "You already belong to this workspace."
   - CTA: "Go to workspace"

---

## 📣 Events (Closed Scope)

- `tenant.user.invited`
- `tenant.invite.resent`
- `tenant.invite.revoked`
- `tenant.invite.accepted`
- `tenant.user.disabled`
- `tenant.user.enabled`
- `tenant.user.role_changed`
- `tenant.user.reenabled`
