# L1 — My Account (Profile, Appearance & Security)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
> Applies global baseline from **Epic Quality, Security & Scalability Practices**.
> Must align with **Security 2FA and Sessions — Global Idle Timeout + Remember Device (30/60/90)** (source of truth for MFA/session policy).

---

# 🎯 Epic Objective

Implement a production-grade **My Account** section allowing authenticated users to manage:

1) Appearance (Light / Dark / System)
2) Profile information (name, photo, timezone, phone)
3) Authentication provider visibility (Google vs Magic link)
4) Two-Factor Authentication (TOTP-based 2FA)
5) **Global per-user inactivity auto-logout** (15m / 30m / 1h / 5h / 8h, sliding)
6) **Remember this device** (skip MFA for 30 / 60 / 90 days on trusted devices)
7) Secure session enforcement and audit logging

This epic must be secure, deterministic, multi-tenant safe, and fully server-enforced.

---

# 📦 Scope

## ✅ Included
- My Account page (Profile / Appearance / Security tabs)
- Profile updates (name, phone, timezone)
- Profile photo upload (secure)
- Appearance preference persistence
- Display login provider (Google vs Magic link)
- 2FA full workflow (setup, verify, backup codes, disable)
- Backup code regeneration
- **Global inactivity auto-logout (allowlisted minutes)**
- **Remember device UX (on MFA verify page) + server issuance**
- Session-level enforcement:
  - MFA gating (PENDING_MFA → FULL)
  - session rotation after MFA
  - server revocation, forced logout via `forceLogoutAt`
  - throttled `lastActivityAt` updates
- Audit logging
- Rate limiting on sensitive endpoints
- Step-up authentication for sensitive actions

## ❌ NOT Included
- Passkeys (WebAuthn)
- Organization-enforced 2FA
- Session/device list UI (can be added later)
- Password change flows (magic-link based auth assumed)

---

# 🏷 UI Naming

Navigation label: **My Account**  
Page title: **Account Settings**

Tabs:
- Profile
- Appearance
- Security

---

# 👤 Authorization Rules

- All endpoints require authenticated session (401 if missing), except MFA verification for `PENDING_MFA` sessions as defined in the Security 2FA/Sessions epic.
- User can only modify their own account (userId from session only).
- Platform-blocked users return 403.
- No cross-user access possible.
- Never accept `userId` from client payload.

---

# 🗄 Schema Changes (Prisma Delta)

> **Important:** This epic must NOT diverge from the Security 2FA/Sessions epic. Where overlap exists, the Security epic is source of truth.

## 1) AppearanceMode enum (already exists in your schema)
```prisma
enum AppearanceMode {
  LIGHT
  DARK
  SYSTEM
}
```

## 2) User model (already matches your schema)
```prisma
model User {
  // existing fields...

  phone                 String?       @db.VarChar(30)
  timezone              String?       @db.VarChar(64)
  appearance            AppearanceMode @default(SYSTEM)
  profilePhotoObjectKey String?       @db.VarChar(512)

  // existing relations...
}
```

## 3) UserSecurity model — align to minutes + backupCodesGeneratedAt (already in your schema)
**Replace any `autoLogoutHours` usage with `autoLogoutMinutes` allowlist.**
```prisma
model UserSecurity {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenVersion Int @default(0) // reserved for future use

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

## 4) Session model — must include MFA gating fields + createdAt (align to Security epic)
**Update any older L1 references that assume only lastActivityAt exists.**
```prisma
enum SessionAuthLevel {
  FULL
  PENDING_MFA
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  createdAt DateTime @default(now())

  lastActivityAt DateTime @default(now())

  // MFA gating
  authLevel             SessionAuthLevel @default(FULL)
  mfaVerifiedAt         DateTime?
  mfaChallengeExpiresAt DateTime?

  // Revocation
  revokedAt    DateTime?
  logoutReason String? @db.VarChar(50)

  // Optional telemetry
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

## 5) RememberedDevice table — required for “Remember this device”
```prisma
model RememberedDevice {
  id String @id @default(cuid())

  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenHash String @unique @db.VarChar(64)

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

# 🔐 Security Requirements (Aligned to Security 2FA/Sessions Epic)

## Step-Up Authentication (Required)
Sensitive actions require recent MFA verification (≤10 minutes):

- Enable 2FA (final verify step)
- Disable 2FA
- Regenerate backup codes
- Toggle/change inactivity auto-logout
- Change phone number (recommended)
- Issue remembered device token (during MFA verify)

Reject with:
- HTTP 403
- code `STEP_UP_REQUIRED`

## Rate Limiting
Apply per-user + per-IP (stricter wins):

- `/api/account/2fa/setup`: 3/min
- `/api/account/2fa/verify`: 5/min
- `/api/account/2fa/disable`: 5/min
- `/api/account/2fa/backup-codes/regenerate`: 5/min
- `/api/auth/*` login endpoints: 10/min

Return:
- HTTP 429
- code `RATE_LIMITED`

## Secret Handling
- TOTP secrets encrypted at rest (never plaintext)
- Backup codes stored hashed only
- Remember-device tokens stored hashed only
- No secrets in logs or audit metadata

---

# 🔐 Two-Factor Authentication (TOTP)

Algorithm:
- RFC 6238
- 30-second window
- 6-digit code
- allow ±1 step drift

Library: use a well-maintained TOTP library (e.g. `otplib`).

---

# 🔄 2FA & Sessions — Behavioral Alignment Notes (Must Implement)

This L1 epic must match these rules:

## MFA gating on login
If user has `totpEnabled = true`:
- If remembered device valid → create FULL session and skip MFA
- Else → create PENDING_MFA session (expires = now + 1 hour, challenge expires = now + 10 min), redirect `/auth/2fa`
- Block all app routes while pending

## Remember this device (30/60/90)
- Only offered on MFA verify screen (`/auth/2fa`)
- Cookie: `__Host-rmd` (HttpOnly, Secure, SameSite=Lax, Path=/)
- Allowlist days: 30 / 60 / 90 only
- DB record required (RememberedDevice with token hash)
- Must be revoked on security resets (disable 2FA, regenerate backup codes, etc.)

## Global inactivity auto-logout
- Global per user (`UserSecurity.autoLogoutEnabled`, `autoLogoutMinutes`)
- Allowlist minutes: 15, 30, 60, 300, 480
- Sliding idle enforcement:
  - if idle > minutes → revoke session + 401
  - throttle `lastActivityAt` updates (only if older than 2 minutes)

---

# 🎨 UI/UX Structure

## Profile Tab
Fields:
- Name (editable)
- Email (read-only)
- Phone (editable) — **step-up required** to change
- Timezone (IANA dropdown)
- Profile photo upload

Login method display:
- If Account.provider = "google" → “Signed in with Google”
- Else → “Signed in with Magic link / Email”

## Appearance Tab
Radio group:
- Light
- Dark
- System

Behavior:
- Apply immediately client-side
- Persist in DB
Audit: `account.appearance.changed`

## Security Tab

### Card 1: Two-Factor Authentication
- Status badge
- Enable flow (QR + manual key + verify)
- Disable flow (requires TOTP or backup code)
- Regenerate backup codes (requires TOTP)
- Show `backupCodesGeneratedAt` if exists

### Card 2: Inactivity Auto-Logout (Global)
- Switch toggle
- When On: dropdown minutes allowlist (15/30/60/300/480)
- Persist immediately
Audit:
- `account.auto_logout.enabled`
- `account.auto_logout.disabled`
- `account.auto_logout.minutes_changed`

### Remember device UI note
- This is **NOT** inside Account Settings tab; it appears on `/auth/2fa` verification screen:
  - checkbox + dropdown (30/60/90)
  - clear explanation that it is device/browser-specific

---

# 📎 Profile Photo Upload (Secure)

- Use signed upload URL
- Validate MIME type server-side
- Enforce max file size server-side
- Store in isolated bucket
- Never expose raw bucket URL/object key
- Store `profilePhotoObjectKey` in User
Audit: `account.profile.photo_updated`

---

# 📡 API Endpoints Summary

GET `/api/account/me`  
PATCH `/api/account/profile`  
PATCH `/api/account/appearance`  
POST `/api/account/photo/upload-url`  

POST `/api/account/2fa/setup`  
POST `/api/account/2fa/verify` (also used to upgrade PENDING_MFA session)  
POST `/api/account/2fa/disable`  
POST `/api/account/2fa/backup-codes/regenerate`  

PATCH `/api/account/security/auto-logout`

---

# 📜 Audit Logging (Required)

Actions:
- `account.profile.updated`
- `account.profile.photo_updated`
- `account.appearance.changed`

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

No secrets in metadata.

---

# 🧪 Edge Cases

- Multiple setup calls overwrite pending secret
- Code replay rejected
- Backup code single-use only **and must be consumed atomically in a transaction**
- Session expires mid-2FA challenge → force re-login
- Toggle auto-logout ON while already idle → next request logs out
- Strict Mode double fetch must not cause duplicate state
- If 2FA is enabled/disabled/regenerated, remembered devices must be revoked

---

# 📊 Performance Considerations

- Minimal selects (no broad includes)
- No cross-tenant joins
- Threshold updates for session activity (2-minute throttle)
- Short transactions for 2FA
- No loops inside transactions
- Index-aware queries only

---

# 🔐 Enforcement Rules

- Server-side enforcement only
- Never trust client flags
- All inputs validated with Zod
- All sensitive operations audited
- Rate limiting applied
- No plaintext secrets stored

---

# ✅ Definition of Done

- Schema migrated (including SessionAuthLevel, Session fields, RememberedDevice, createdAt)
- All endpoints implemented
- 2FA fully functional
- Backup codes hashed and single-use (atomic consume)
- Global inactivity logout enforced server-side with allowlisted minutes
- Remember device supported (30/60/90) on `/auth/2fa` and enforced server-side
- Appearance persists and applies instantly
- Provider detection works
- Audit logging complete
- Rate limiting active
- Build passes
- No privilege escalation possible

---

# ✅ Acceptance Criteria

- User updates name, phone, timezone successfully (phone requires step-up)
- Email visible but not editable
- Appearance changes persist
- Login method displayed correctly
- 2FA setup requires verification before enabling
- Backup codes shown once and cannot be reused
- 2FA disable requires valid TOTP or backup code and triggers forced logout + revoke remembered devices
- Backup code regeneration requires TOTP and triggers forced logout + revoke remembered devices
- Inactivity auto-logout logs out user after selected idle time across devices
- Remember device (30/60/90) skips MFA until expiration
- All security changes logged
- No cross-user access possible
