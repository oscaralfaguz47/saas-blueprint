# Security 2FA and Sessions — Global Idle Timeout + Remember Device (30/60/90)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
> This epic is a continuation of the **My Account** epic (L1 — My Account (Profile, Appearance & Security)).
> Applies baseline from **Epic Quality, Security & Scalability Practices** (Sections 3.6, 3.9, 3.10).

---

# 🎯 Epic Objective

Implement a **production-grade** security system for:

1) **TOTP 2FA** enrollment and enforcement (Authenticator app)  
2) **Backup codes** (hashed, single-use)  
3) **Global per-user inactivity auto-logout** (15m / 30m / 1h / 5h / 8h) enforced server-side  
4) **Remember this device** to skip 2FA on trusted devices for **30 / 60 / 90 days**  
5) **Session hardening**: MFA challenge gating, session rotation, server revocation, audit logs, rate limiting  

This epic must be deterministic, multi-tenant safe, and secure at scale.

---

# 📦 Scope

## ✅ Included
- 2FA enrollment: setup → verify → enable
- 2FA disable (requires TOTP or backup code) + step-up
- Backup codes regeneration (requires TOTP) + step-up
- Global inactivity auto-logout: switch + allowlisted time values (minutes) + server enforcement
- “Remember this device” (skip 2FA for 30/60/90 days) tied to device token cookie + DB record (hashed)
- Login MFA gating: pending MFA session → verify → full session (session rotation)
- Session revocation and forced logout (per-user)
- Audit logging (canonical keys)
- Rate limiting on sensitive endpoints
- UI/UX contract for Security tab flows (loading/empty/error)
- MFA cancel flow from `/auth/2fa`: user can intentionally **sign out** while in `PENDING_MFA` (revokes pending session + clears cookie)

## ❌ NOT Included
- WebAuthn / Passkeys
- Tenant-enforced 2FA policies (org-wide enforcement)
- Session/device list UI (can be added later)
- Password change flows (magic link / IdP assumed)

---

# 🏷 UI/UX Requirements (Security Tab)

Route: `app/account?tab=security`

## Card 1 — Two-Factor Authentication
- Status badge: **Enabled** / **Disabled**
- Primary actions:
  - **Enable 2FA** → shows QR + manual key + code input → verify
  - **Disable 2FA** → input accepts **TOTP OR backup code**
  - **Regenerate backup codes** → requires current **TOTP**
- Show metadata:
  - “Backup codes generated: {date}” (if exists)

## Card 2 — Inactivity auto-logout (Global)
- Switch: On/Off
- When On: select dropdown with allowlisted values:
  - 15 minutes, 30 minutes, 1 hour, 5 hours, 8 hours
- Copy must say **“Global for your account (all devices).”**
- Persist changes immediately (no save button)
- If turned OFF: keep last selected value stored but not enforced

### Card 3 — Remember this device (During 2FA verify screen) (EXTEND)
- On `/auth/2fa` add:
  - Checkbox: “Remember this device”
  - If checked, dropdown with: 30 / 60 / 90 days
  - Link: “Use a backup code” (if backup codes exist)
  - **Secondary button: “Sign out” / “Back to login”**
    - Copy: “Lost access to your authenticator? You can sign out and try another account.”
    - Behavior: calls `POST /api/auth/2fa/cancel`, then redirects to `/auth/login`

Notes:
- “Sign out” must be available even when the user cannot provide TOTP/backup code.
- This button must never downgrade or bypass MFA; it only revokes the pending session.

---

# 👤 Authorization Rules

- All endpoints require authenticated session (401 if missing) **except** the MFA verification step for **PENDING_MFA** sessions.
- User can only manage their own security settings (userId resolved from session only).
- Platform-blocked users return 403.
- Never accept `userId` from client payload.
- Remember-device can be created during MFA verification.

---

# 🗄 Data Model (Prisma) — Required Changes

## 1) New enums

```prisma
enum SessionAuthLevel {
  FULL
  PENDING_MFA
}
```

## 2) Extend Session (NextAuth model)

```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  createdAt DateTime @default(now())

  // Sliding inactivity enforcement (global policy uses user.security settings)
  lastActivityAt DateTime @default(now())

  // MFA gating
  authLevel             SessionAuthLevel @default(FULL)
  mfaVerifiedAt         DateTime?
  mfaChallengeExpiresAt DateTime? // used only for PENDING_MFA sessions (now + 10 minutes)

  // Revocation / hard logout
  revokedAt    DateTime?
  logoutReason String? @db.VarChar(50)

  // Lightweight device telemetry (optional but recommended)
  ipFirstSeen String? @db.VarChar(64)
  lastIp      String? @db.VarChar(64)
  userAgent   String? @db.VarChar(300)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
  @@index([createdAt])
  @@index([lastActivityAt])
  @@index([userId, authLevel])
  @@index([userId, revokedAt])
}
```

## 3) Extend UserSecurity

```prisma
model UserSecurity {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenVersion Int @default(0) // reserved for future use if embedded in session claims

  // TOTP 2FA
  totpEnabled          Boolean   @default(false)
  totpEnabledAt        DateTime?
  totpSecretEnc        String?   @db.VarChar(500)
  totpPendingSecretEnc String?   @db.VarChar(500)

  // Backup codes (hashed, single-use)
  backupCodeHashes       String[]  @default([])
  backupCodesGeneratedAt DateTime?

  // Global inactivity auto-logout (minutes: 15, 30, 60, 300, 480)
  autoLogoutEnabled Boolean @default(false)
  autoLogoutMinutes Int     @default(300)

  // Force logout all sessions at/after this time
  forceLogoutAt DateTime?

  lockedUntil DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([totpEnabled])
  @@index([autoLogoutEnabled])
}
```

## 4) New table: RememberedDevice

```prisma
model RememberedDevice {
  id String @id @default(cuid())

  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenHash String @unique @db.VarChar(64) // SHA-256 hash only

  label       String? @db.VarChar(80)
  userAgent   String? @db.VarChar(300)
  ipFirstSeen String? @db.VarChar(64)

  expiresAt DateTime
  createdAt DateTime @default(now())
  revokedAt DateTime?

  @@index([userId, expiresAt])
  @@index([userId, revokedAt])
}
```

---

# 🔐 Security & Crypto Requirements

- TOTP: RFC 6238, 30-second window, 6 digits, allow ±1 step.
- Encrypt `totpSecretEnc` and `totpPendingSecretEnc`.
- Backup codes:
  - Generate 10 codes.
  - Store hashes only (argon2/bcrypt recommended).
  - Must be single-use and consumed atomically.
- Remember device token:
  - Random 256-bit token.
  - Store only SHA-256 hash.
  - Cookie: `__Host-rmd`, HttpOnly, Secure, SameSite=Lax, Path=/.
- No secrets in logs or audit metadata.

---

# 🔐 Session Enforcement Rules

## 1) MFA Gating and Rotation

If `totpEnabled = true`:

### Primary login

If remembered device valid:
- Create FULL session (`authLevel=FULL`, `mfaVerifiedAt=now`).

Else:
- Create PENDING_MFA session:
  - `authLevel=PENDING_MFA`
  - `mfaChallengeExpiresAt=now + 10 minutes`
  - `expires=now + 1 hour`

Redirect to `/auth/2fa`.

### After successful MFA verify

- Revoke pending session (`logoutReason="mfa_upgraded"`).
- Create new FULL session (`authLevel=FULL`, `mfaVerifiedAt=now`).
- Rotate session token.
- Redirect to app.

---

## 2) Remember Device Validation

On login:
- If `__Host-rmd` cookie exists:
  - Hash token.
  - Load RememberedDevice.
  - Validate:
    - Same user.
    - `revokedAt IS NULL`.
    - `expiresAt > now`.

If valid → skip MFA.

---

## 3) Global Idle Timeout

If `autoLogoutEnabled = true`:

On every FULL session request:

1. If `forceLogoutAt` set and `(session.mfaVerifiedAt ?? session.createdAt) < forceLogoutAt`:
   - Revoke session.
   - Return 401 and clear cookie.

2. If `now - lastActivityAt > autoLogoutMinutes`:
   - Revoke session with `"idle_timeout"`.
   - Return 401.

3. Else:
   - Update `lastActivityAt` only if older than 2 minutes.

---

## 4) Pending MFA Expiration

If `authLevel=PENDING_MFA` and:
- `now > mfaChallengeExpiresAt`
OR
- `now > expires`

→ revoke session and force re-login.

---

## 5) Pending MFA Cancel (User-Initiated Logout)

If `authLevel=PENDING_MFA`, the user may choose to sign out from `/auth/2fa`.

Server behavior (mandatory):
1) Revoke the current pending session:
   - `revokedAt = now`
   - `logoutReason = "user_cancelled_mfa"`
2) Clear the session cookie (Set-Cookie Max-Age=0)
3) Return `{ ok: true }`

Client behavior:
- After success, redirect to `/auth/login`
- Optionally show toast: “Signed out. Please sign in again.”

Security notes:
- Cancel must not require step-up.
- Cancel must not create/rotate a FULL session.
- Cancel must be idempotent (repeated calls are safe).


# 🔒 Step-Up Authentication

Required for:
- Disable 2FA
- Regenerate backup codes
- Change inactivity auto-logout
- Issue remembered device

Conditions:
- `authLevel=FULL`
- `mfaVerifiedAt != null`
- `now - mfaVerifiedAt <= 10 minutes`

Else:
- 403 `STEP_UP_REQUIRED`

---

# 🚦 Rate Limiting

- `/api/account/2fa/setup` → 3/min
- `/api/account/2fa/verify` → 5/min
- `/api/account/2fa/disable` → 5/min
- `/api/account/2fa/backup-codes/regenerate` → 5/min
- `/api/auth/*` login → 10/min
- `/api/auth/2fa/*` verify → 10/min
- `/api/auth/2fa/cancel` → 30/min

Return 429 `RATE_LIMITED`.

---

# 📜 Audit Keys

- `account.2fa.setup_started`
- `account.2fa.enabled`
- `account.2fa.disabled`
- `account.2fa.backup_codes_regenerated`
- `account.auto_logout.enabled`
- `account.auto_logout.disabled`
- `account.auto_logout.minutes_changed`
- `account.remember_device.enabled`
- `account.remember_device.revoked_all`
- `account.sessions.forced_logout`
- `account.sessions.mfa_cancelled`

Metadata (allowed):

{ reason: "user_cancelled_mfa" }
Exclude:

tokens, codes, secrets

---

# 🍪 Cookie Behavior

- PENDING_MFA session cookie set after primary auth.
- FULL session cookie only after successful MFA.
- On revocation/expiration → clear session cookie (`Max-Age=0`).
- Remembered device cookie:
  - `__Host-rmd`
  - HttpOnly
  - Secure
  - SameSite=Lax
  - Path=/

  On POST /api/auth/2fa/cancel, server must clear session cookie via Set-Cookie with Max-Age=0 (even if session already expired/revoked)

---
## 6) Workspace-Enforced 2FA (mfaEnforced)

If `UserSecurity.mfaEnforced = true` AND `totpEnabled = false`:

- After successful primary authentication
- Do NOT create FULL session
- Redirect to mandatory 2FA setup flow
- Block access to app routes until configured

This enforcement is server-side only.
---

# 🧪 Edge Cases

- Verify without pending secret → 409 `NO_PENDING_2FA_SETUP`
- Backup code reused → `INVALID_2FA_CODE`
- Pending MFA expired → `MFA_CHALLENGE_EXPIRED`
- Auto-logout toggled ON while idle → next request logs out
- Remember device expired → fallback to MFA
- Security reset revokes all sessions + remembered devices
- User clicks “Sign out” on /auth/2fa after pending session already expired:
    - Endpoint responds { ok: true }, clears cookie, redirects to login
    - Must not throw or leak state

---

# 📊 Performance

- Throttle `lastActivityAt` updates (≥2 min delta).
- Use indexed queries only.
- Avoid N+1.
- Short transactions for MFA operations.

---

# ✅ Definition of Done

- Schema migrated.
- Endpoints implemented with Zod + standard error shape.
- MFA gating works.
- Remember device works (30/60/90 days).
- Idle timeout works globally.
- Step-up enforced.
- Audit logs complete.
- No secrets stored or logged.
- Build passes.

---

# ✅ Acceptance Criteria

- User enables 2FA, verifies, receives backup codes once.
- User cannot access app until MFA verified (unless remembered).
- Remember device skips MFA until expiration.
- Disabling 2FA revokes remembered devices and sessions.
- Regenerating backup codes revokes remembered devices.
- Global idle timeout logs user out across devices.
