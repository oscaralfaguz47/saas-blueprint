# 6 — Workspace Member Security Governance (2FA Enforcement, Reset & Session Control)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
> Fully aligned with:
> - **A2 — Roles and Permissions (RBAC)** (`docs/epics/rolesAndPermissions/2-A2-Roles-And-Permissions.md`)
> - **Security 2FA and Sessions — Global Idle Timeout + Remember Device (30/60/90)** (`docs/epics/security/security-2fa-sessions.md`)
> - **L1 — My Account (Profile, Appearance & Security)**

This epic governs **workspace-level administrative control over user security**, while keeping authentication and 2FA technically **global per user**.

---

# 🎯 Epic Objective

Implement a **robust, hierarchy-enforced security governance layer** that allows authorized workspace roles to:

1. Force 2FA for a member  
2. Reset a member’s 2FA configuration  
3. Disable a member’s 2FA (admin override)  
4. Revoke all active sessions  
5. Revoke all remembered devices  

While guaranteeing:

- Strict RBAC hierarchy enforcement
- Governance safety constraints preservation
- No privilege escalation
- Global security model consistency (2FA is user-global)
- Mandatory 2FA blocking at login when enforced
- Full auditability
- Rate limiting
- Idempotent endpoints
- Multi-tenant isolation

This epic introduces **workspace governance over global security**, without breaking the global authentication model.

---

# 🧠 Critical Architectural Principle

### 🔐 2FA IS GLOBAL PER USER

- `totpEnabled` is global.
- Sessions are global.
- Remembered devices are global.
- Resetting or disabling 2FA affects **all workspaces**.

### 🏢 Enforcement (`mfaEnforced`) is PER WORKSPACE

- A workspace can require 2FA for a user.
- Another workspace cannot override that enforcement.
- If ANY workspace enforces 2FA → user must configure 2FA globally.

---

# 📦 Scope

## ✅ Included

- Workspace-level 2FA enforcement flag
- Administrative 2FA reset
- Administrative 2FA disable
- Session revocation
- Remembered device revocation
- Mandatory login enforcement
- Authority hierarchy enforcement
- Governance constraints validation
- Audit logging
- Rate limiting
- Idempotent operations
- UI integration under Workspace → Members

## ❌ NOT Included

- Organization-wide policy engine
- Passkey management
- Billing enforcement
- Invite-time 2FA enforcement
- Global platform-admin overrides (future epic)

---

# 🧠 Alignment With A2 — RBAC

No new permissions are introduced.

Reuses:

- `tenant.users.manage`
- `tenant.users.disable`

Every endpoint must validate:

- Authenticated session
- Tenant membership
- `tenant.users.manage`
- Hierarchy authority (rank-based)
- Governance constraints
- Tenant isolation

No UI-only enforcement.
No implicit permission inheritance.

---

# 👑 Authority Hierarchy

Primary Owner (5)  
Owner (4)  
Admin (3)  
Finance (2)  
Member (1)

Rule:

```
rank(actor) > rank(target)
```

Strictly greater.

---

# 🔐 Security Authority Matrix

| Actor | Can Manage Security Of |
|--------|------------------------|
| Primary Owner | Anyone |
| Owner | Admin, Finance, Member |
| Admin | Finance, Member |
| Finance | Member |
| Member | Nobody |

### Additional Hard Rules

- Owner cannot manage Owner-level peers
- Only Primary Owner can manage Owner-level members
- No one can manage themselves via workspace endpoint
- No one can reset/disable Primary Owner except:
  - The Primary Owner themselves (self-service only)
  - A future platform-admin role (not in scope)

---

# 🔒 Governance Safety Constraints

These must ALWAYS be preserved:

1. Exactly one Primary Owner must exist
2. At least one Owner-level user must exist
3. No action may leave workspace without Owner-level protection
4. No privilege escalation via payload
5. Cannot disable 2FA of the last Owner-level user if 2FA is enforced in workspace
6. Cannot weaken security of a higher-ranked member

If violated → `409 GOVERNANCE_CONSTRAINT_VIOLATION`

---

# 🗄 Data Model Updates

## 1️⃣ Workspace-Level Enforcement Model

Add new model:

```prisma
model WorkspaceMemberSecurity {
  id        String @id @default(cuid())
  tenantId  String
  userId    String

  mfaEnforced Boolean @default(false)
  enforcedByUserId String?
  enforcedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, userId])
  @@index([tenantId])
  @@index([userId])
}
```

This decouples enforcement from global `UserSecurity`.

---

## 2️⃣ Global UserSecurity (Already Exists)

Must remain global:

- totpEnabled
- totpSecretEnc
- backupCodeHashes
- forceLogoutAt

---

# 🌐 Global Enforcement Resolution Logic

On login:

1. Load all active workspaces for user
2. Check if ANY workspace has `mfaEnforced = true`
3. If TRUE and `totpEnabled = false`:
   - Redirect to `/auth/setup-2fa`
4. If TRUE and `totpEnabled = true`:
   - Require MFA challenge unless remembered device valid

This guarantees cross-workspace consistency.

---

# 🔐 Administrative Operations

All endpoints:

Base path:

```
PATCH /api/settings/workspace/members/:memberId/security/<action>
```

Validation:

- `memberId` must be valid CUID
- Must exist in workspace
- Actor must satisfy hierarchy
- Step-up required (mfaVerifiedAt ≤ 10 min)

---

## 1️⃣ Force 2FA

Endpoint:

```
PATCH /.../force-2fa
```

Transaction:

- Upsert WorkspaceMemberSecurity
- Set `mfaEnforced = true`
- Set `enforcedByUserId`
- Set `enforcedAt`
- Set `forceLogoutAt = now`
- Revoke sessions
- Revoke remembered devices

Idempotent:

If already enforced → return:

```
{ ok: true, alreadyEnforced: true }
```

Audit:

`workspace.member_security.2fa_forced`

---

## 2️⃣ Reset 2FA

Endpoint:

```
PATCH /.../reset-2fa
```

Transaction:

- Clear global totpSecretEnc
- Clear backupCodeHashes
- Set totpEnabled = false
- Set forceLogoutAt = now
- Revoke remembered devices

Workspace enforcement remains unchanged.

Idempotent case:

```
{ ok: true, skipped: true, reason: "no_2fa_to_reset" }
```

Audit:

`workspace.member_security.2fa_reset`

---

## 3️⃣ Disable 2FA (Administrative Override)

Endpoint:

```
PATCH /.../disable-2fa
```

Transaction:

- Clear global secrets
- Clear backup codes
- Set totpEnabled = false
- Set forceLogoutAt = now
- Revoke sessions
- Revoke remembered devices

Does NOT auto-clear workspace enforcement.

If enforcement exists → user must reconfigure 2FA.

Idempotent:

```
{ ok: true, alreadyDisabled: true }
```

Audit:

`workspace.member_security.2fa_disabled`

---

## 4️⃣ Revoke Sessions

Endpoint:

```
PATCH /.../revoke-sessions
```

Action:

- Set `forceLogoutAt = now`
- Mark all sessions revoked

Audit:

`workspace.member_security.sessions_revoked`

---

## 5️⃣ Revoke Remembered Devices

Endpoint:

```
PATCH /.../revoke-remembered-devices
```

Action:

- Update RememberedDevice.revokedAt = now

Audit:

`workspace.member_security.remembered_devices_revoked`

---

# 🔐 Login & Access Enforcement

## Mandatory 2FA Setup Page

Route:

```
/auth/setup-2fa
```

Displayed when:

- ANY workspace enforces 2FA
- AND `totpEnabled = false`

Rules:

- Must not render full app layout
- Must not require FULL session
- Must include:
  - QR code
  - Manual key
  - Verify input
  - Backup codes display
  - "Sign out" button

After success:

- Redirect to `/auth/2fa`
- Complete MFA challenge
- Upgrade session to FULL

---

# 🔁 Session Enforcement

Must validate:

- `forceLogoutAt`
- `revokedAt`
- Idle timeout
- MFA gating
- Pending MFA expiration

All server-side.

---

# 🚦 Rate Limiting

All endpoints:

5 requests per minute per actor.

Return:

`429 RATE_LIMITED`

---

# 📜 Audit Logging

Each operation logs:

- actorId
- targetUserId
- tenantId
- action key
- timestamp
- before/after snapshot (safe fields only)

Never log:

- TOTP secrets
- Backup codes
- Tokens

Canonical keys:

- workspace.member_security.2fa_forced
- workspace.member_security.2fa_reset
- workspace.member_security.2fa_disabled
- workspace.member_security.sessions_revoked
- workspace.member_security.remembered_devices_revoked

---

# 🎨 UI Integration

Members list must return:

- `mfaEnforced` (workspace-level)
- `totpEnabled` (global)
- Derived state:
  - Enforced
  - Enabled
  - Off

Security dropdown filtered by hierarchy.

After action:

- Show success toast
- Refetch members list

UI never replaces server enforcement.

---

# 🧪 Edge Cases

- Actor manages peer → 403
- Actor manages higher rank → 403
- Owner tries to manage Primary Owner → 403
- Self-target via admin endpoint → 403
- Invalid memberId → 400
- Member not in workspace → 404
- Cross-tenant access → 404
- Governance violation → 409
- Session revoked mid-operation → 401
- Already enforced → 200 idempotent
- Already disabled → 200 idempotent
- No 2FA to reset → 200 skipped

---

# 📊 Performance

- Indexed lookups
- Bulk session updates by userId
- No N+1 queries
- Atomic transactions
- Throttle activity updates
- No loops inside transactions

---

# ✅ Definition of Done

- Prisma schema migrated
- WorkspaceMemberSecurity model implemented
- Endpoints implemented with Zod
- Hierarchy enforced strictly
- Governance constraints validated
- Login enforcement integrated
- Dedicated `/auth/setup-2fa` page
- Session revocation working
- Remembered device revocation working
- Idempotency implemented
- Audit logging complete
- Rate limiting active
- No privilege escalation possible
- Build passes

---

# ✅ Acceptance Criteria

- Primary Owner can manage anyone
- Owner cannot manage Owner-level
- Admin cannot manage Admin peers
- Finance manages Members only
- Force 2FA blocks login until configured
- Reset logs user out everywhere
- Disable logs user out everywhere
- Revoking sessions logs out immediately
- Revoking remembered devices forces MFA next login
- Enforcement is respected across all workspaces
- No cross-tenant leakage
- All actions audited

---

# 🧪 Manual test checklist

After running `prisma migrate deploy` (or `prisma migrate dev`):

1. **Members list** — Settings → Workspace → Members: table shows 2FA column (Enforced / Enabled / Off). Security dropdown appears only for members you can manage (hierarchy).
2. **Step-up** — Call any security PATCH without recent MFA (e.g. after >10 min or new session): expect 403 with `STEP_UP_REQUIRED`. Complete 2FA challenge, then retry within 10 min: expect 200.
3. **Force 2FA** — As Admin/Owner, Force 2FA on a member without 2FA. Member’s next login redirects to `/auth/setup-2fa`; after setup, to `/auth/2fa`, then app. Members list shows “Enforced” for that member in this workspace.
4. **Idempotency** — Force 2FA again on same member: 200 with `alreadyEnforced: true`. Reset 2FA on member with no TOTP: 200 with `skipped: true, reason: "no_2fa_to_reset"`. Disable 2FA on member with no TOTP: 200 with `alreadyDisabled: true`.
5. **Reset / Disable / Revoke** — Reset 2FA: member’s TOTP cleared, devices revoked; enforcement for workspace unchanged. Disable 2FA: TOTP cleared, sessions and devices revoked; workspace enforcement unchanged. Revoke sessions: member logged out. Revoke remembered devices: next login requires MFA.
6. **Governance** — As Owner, try to Force 2FA on the only other Owner: allowed. Reset or Disable 2FA on that same last Owner-level user: 409 `GOVERNANCE_CONSTRAINT_VIOLATION`.
7. **Rate limit** — Trigger the same security action 6+ times in 1 minute: 429 `RATE_LIMITED`.
8. **Cross-tenant** — Use a memberId (userId) from another workspace: 404.
