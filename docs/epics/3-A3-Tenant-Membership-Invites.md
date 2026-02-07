# A3 — Tenant Membership Invites

---

## 🎯 Epic Objective

Allow workspace administrators to **invite users by email** to join a tenant, ensuring:

- secure, token-based invitation flow
- correct membership creation or activation
- prevention of duplicate memberships
- full auditability
- clean handling of existing vs new users

---

## 📦 Scope

### ✅ Included

- Invite user to tenant via email
- Generate invitation token (hashed)
- Invitation expiration handling
- Accept invitation:
  - existing user → attach membership
  - new user → redirect to registration flow
- Disable / revoke invitation
- Disable existing tenant member
- Audit logging for all critical actions

---

### ❌ Explicitly NOT Included

- Role customization during invite (default role only in v1)
- Bulk invites
- SCIM / directory sync
- Auto-accept domain-based invites

---

## 🔐 Permissions Required

| Action | Required Permission |
|------|---------------------|
| Invite user | `tenant.users.invite` |
| Disable member | `tenant.users.manage` |
| Accept invite | Public (token-based), validated server-side |

---

## 📐 Business Rules

---

### ✉️ Invitation Creation

When inviting a user by email:

- Create `TenantInvitation` with:
  - `tenantId`
  - `email`
  - `tokenHash` (never store raw token)
  - `expiresAt`
  - `invitedByUserId`
- Send invitation email containing:
  - tenant name
  - invite link with **raw token**
- Invitation must be **unique per tenant + email** (active only)

⚠️ If an active invitation already exists:
- return clear error
- do NOT create duplicates

---

### 🔑 Token Security

- Token must:
  - be cryptographically random
  - be hashed before storage
- Token is:
  - single-use
  - invalid after expiration
  - invalid after acceptance or revocation

---

### ⏳ Expiration Rules

- Expired invitations:
  - cannot be accepted
  - return explicit error
- No silent reactivation
- Re-invite requires **new invitation + new token**

---

### 👤 Invitation Acceptance Flow

#### Case 1 — Existing User

If invited email matches an existing user:

- Create `TenantMembership` if not exists
- Set:
  - `status = ACTIVE`
  - `joinedAt = now()`
- Assign default role:
  - `MEMBER`
- Mark invitation as `acceptedAt = now()`

---

#### Case 2 — New User

If invited email does not exist:

- Redirect to registration flow
- After successful signup:
  - auto-attach membership
  - same rules as existing user
- Invitation token is consumed only once

---

### 🚫 Duplicate Membership Prevention

- A user **cannot** have more than one membership per tenant
- DB constraint is the source of truth:
  - `TenantMembership(tenantId, userId)` → UNIQUE
- If user already belongs to tenant:
  - invitation acceptance fails cleanly
  - no duplicate membership created

---

### 🧑‍🦽 Disable Member

Disabling a member:

- Updates `TenantMembership.status = DISABLED`
- Does NOT delete:
  - membership
  - audit history
- User immediately loses access to tenant

---

## 🧾 Audit Logging

### Required Audit Events

| Action | Audit `action` |
|------|----------------|
| Invite created | `tenant.invite.created` |
| Invite accepted | `tenant.invite.accepted` |
| Invite revoked | `tenant.invite.revoked` |
| Member disabled | `tenant.member.disabled` |

Each audit log must include:
- `actorUserId`
- `tenantId`
- relevant target identifiers

---

## 🔄 Transaction Rules

Invitation acceptance must occur in **one DB transaction**:

1. Validate token
2. Validate expiration
3. Create or validate user
4. Create membership
5. Assign role
6. Mark invitation as accepted
7. Insert AuditLog

❗ If any step fails → **full rollback**

---

## ✅ Definition of Done (DoD)

This epic is complete when:

- Invitations are securely created with token + expiration
- Invitation emails are sent correctly
- Accepting an invite:
  - attaches user to tenant
  - assigns correct role
  - prevents duplicates
- Expired tokens are rejected
- Membership disabling works correctly
- All actions are logged in AuditLog
- No partial data can exist

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
- email is sent

---

### Expired Token

**Given**
- an expired invitation

**When**
- user attempts acceptance

**Then**
- acceptance fails
- clear error is returned
- no membership is created

---

### Existing Membership

**Given**
- user already belongs to tenant

**When**
- invite is accepted

**Then**
- operation fails cleanly
- no duplicate membership is created

---

## ⚠️ Edge Cases

### Security
- Token brute force attempts → rate-limited
- Invalid token → generic error (no leakage)
- Platform-blocked users cannot accept invites

### Data Integrity
- Concurrent acceptance attempts → one succeeds
- Invitation cannot be reused

---

## 📊 Indexes & Constraints (Required)

- `TenantInvitation(tokenHash)` → UNIQUE
- `TenantInvitation(tenantId, email)` → UNIQUE (active invites)
- `TenantMembership(tenantId, userId)` → UNIQUE

---

## 📣 Events (Closed Scope)

- `tenant.invite.created`
- `tenant.invite.accepted`
- `tenant.invite.revoked`
- `tenant.member.disabled`

