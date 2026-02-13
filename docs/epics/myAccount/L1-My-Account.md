# L1 — My Account (Profile, Appearance & Security)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
> Applies global baseline from Epic Quality, Security & Scalability Practices.

---

# 🎯 Epic Objective

Implement a production-grade **My Account** section allowing authenticated users to manage:

1. Appearance (Light / Dark / System)
2. Profile information (name, photo, timezone, phone)
3. Authentication provider visibility (Google vs Magic link)
4. Two-Factor Authentication (TOTP-based 2FA)
5. Optional inactivity auto-logout (5 hours, sliding)
6. Secure session enforcement and audit logging

This epic must be secure, deterministic, multi-tenant safe, and fully server-enforced.

---

# 📦 Scope

## ✅ Included
- My Account page (Profile / Appearance / Security tabs)
- Profile updates (name, phone, timezone)
- Profile photo upload (secure)
- Appearance preference persistence
- Display login provider
- 2FA full workflow (setup, verify, backup codes, disable)
- Backup code regeneration
- Inactivity auto-logout (5h)
- Session-level enforcement
- Audit logging
- Rate limiting on sensitive endpoints

## ❌ NOT Included
- Passkeys (WebAuthn)
- Organization-enforced 2FA
- Session/device list UI
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

- All endpoints require authenticated session (401 if missing)
- User can only modify their own account (userId from session only)
- Platform-blocked users return 403
- No cross-user access possible
- Never accept userId from client payload

---

# 🗄 Schema Changes (Prisma Delta)

## 1️⃣ Add AppearanceMode enum

```prisma
enum AppearanceMode {
  LIGHT
  DARK
  SYSTEM
}

## 2️⃣ Extend User model

model User {
  // existing fields...

  phone      String?        @db.VarChar(30)
  timezone   String?        @db.VarChar(64)
  appearance AppearanceMode @default(SYSTEM)

  // existing relations...
}

3️⃣ Extend UserSecurity model

model UserSecurity {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenVersion Int @default(0)

  // TOTP 2FA
  totpEnabled          Boolean  @default(false)
  totpEnabledAt        DateTime?
  totpSecretEnc        String?  @db.VarChar(500)
  totpPendingSecretEnc String?  @db.VarChar(500)
  backupCodeHashes     String[] @default([])

  // Inactivity logout
  autoLogoutEnabled Boolean @default(false)
  autoLogoutHours   Int     @default(5)

  forceLogoutAt DateTime?

  mfaEnabled  Boolean   @default(false)
  mfaEnforced Boolean   @default(false)
  mfaResetAt  DateTime?

  lockedUntil DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([totpEnabled])
  @@index([autoLogoutEnabled])
}

4️⃣ Extend Session model

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  lastActivityAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
  @@index([lastActivityAt])
}

🔐 Security Requirements
Step-Up Authentication (Required)

Sensitive actions require recent authentication (≤10 minutes) OR explicit re-auth:

Enable 2FA (final verify step)

Disable 2FA

Regenerate backup codes

Toggle inactivity auto-logout

Change phone number

Reject with 403 if not recently authenticated.

## Rate Limiting

Apply per-user limits:

/2fa/setup: 3/min

/2fa/verify: 5/min

/2fa/disable: 5/min

/2fa/backup-codes/regenerate: 5/min

Return 429 with code RATE_LIMITED.

## Secret Handling

TOTP secrets encrypted at rest (never plaintext)

Backup codes stored hashed only

No secrets logged

No secrets in audit metadata

🔐 Two-Factor Authentication (TOTP)

Algorithm:

RFC 6238

30-second window

6-digit code

Use secure library (e.g., otplib)

## 2FA Setup Flow
POST /api/account/2fa/setup

Auth required

Rate limited

Generate secret

Store encrypted in totpPendingSecretEnc

Audit: account.2fa.setup_started

Response:
{
  "otpauthUri": "string",
  "manualKey": "string"
}

POST /api/account/2fa/verify
Body:
{ "code": "123456" }

## Inside transaction:

Validate TOTP against totpPendingSecretEnc

Move secret → totpSecretEnc

Set totpEnabled = true

Set totpEnabledAt = now()

Set mfaEnabled = true

Generate backup codes

Store hashed codes

Clear pending secret

Audit account.2fa.enabled

Return plaintext backup codes once.

## Disable 2FA

POST /api/account/2fa/disable

Body:
{ "code": "123456" }

## Transaction:

Step-up auth required

Validate code against totpSecretEnc

Clear secret + backup codes

Set totpEnabled = false

Set mfaEnabled = false

Audit account.2fa.disabled

## Regenerate Backup Codes

POST /api/account/2fa/backup-codes/regenerate

Step-up required

Validate TOTP code

Replace stored backup code hashes

Audit account.2fa.backup_codes_regenerated

Return new plaintext codes once

## 2FA Login Enforcement

If totpEnabled = true:

After login, require 2FA challenge

Until verified, restrict access to app routes

On success, mark session as 2FA verified

🔄 Inactivity Auto-Logout (5 Hours)
UX

Switch:
“Log me out after 5 hours of inactivity”

## Server Enforcement

If autoLogoutEnabled = true:

On every authenticated request:

1.Check now - session.lastActivityAt

2. If > 5 hours:

2.1. Invalidate session

Return 401

3. Else:

3.1. If lastActivityAt older than 5 minutes → update to now()

Avoid updating lastActivityAt on every request to reduce DB writes.

🎨 UI/UX Structure
Profile Tab

## Fields:

Name (editable)

Email (read-only)

Phone (editable)

Timezone (IANA dropdown)

Profile photo upload

## Login method:

If Account.provider = "google" → “Signed in with Google”

Else → “Signed in with Magic link / Email”

## Appearance Tab

# Radio group:

Light

Dark

System

# Behavior:

Apply immediately client-side

Persist in DB

# Audit: account.appearance.changed

## Security Tab

Card 1: Two-Factor Authentication

Status badge

Enable flow (QR + verify)

Disable flow

Regenerate backup codes

Card 2: Inactivity Auto Logout

Switch toggle

Persist immediately

Audit:

account.auto_logout.enabled

account.auto_logout.disabled

📎 Profile Photo Upload

Signed upload URL

Server-side MIME validation

Max size enforcement

Store in isolated bucket

Never expose raw object key

Audit account.profile.photo_updated

📡 API Endpoints Summary

GET /api/account/me

PATCH /api/account/profile

PATCH /api/account/appearance

POST /api/account/photo/upload-url

POST /api/account/2fa/setup

POST /api/account/2fa/verify

POST /api/account/2fa/disable

POST /api/account/2fa/backup-codes/regenerate

📜 Audit Logging (Required)

Actions:

account.profile.updated

account.profile.photo_updated

account.appearance.changed

account.2fa.setup_started

account.2fa.enabled

account.2fa.disabled

account.2fa.backup_codes_regenerated

account.auto_logout.enabled

account.auto_logout.disabled

No secrets in metadata.

🧪 Edge Cases

Multiple setup calls overwrite pending secret

Code replay rejected

Backup code single-use only

Session expires mid-2FA challenge

Toggle auto-logout ON while already idle → next request logs out

Strict Mode double fetch must not cause duplicate state

📊 Performance Considerations

Minimal selects (no includes)

No cross-tenant joins

Threshold updates for session activity

Short transactions for 2FA

No loops inside transactions

🔐 Enforcement Rules

Server-side enforcement only

Never trust client flags

All inputs validated with Zod

All sensitive operations audited

Rate limiting applied

No plaintext secrets stored

✅ Definition of Done

Schema migrated

All endpoints implemented

2FA fully functional

Backup codes hashed and single-use

Inactivity logout enforced server-side

Appearance persists and applies instantly

Provider detection works

Audit logging complete

Rate limiting active

Build passes

No privilege escalation possible

✅ Acceptance Criteria

User updates name, phone, timezone successfully

Email visible but not editable

Appearance changes persist

Login method displayed correctly

2FA setup requires verification before enabling

Backup codes shown once

Backup codes cannot be reused

2FA disable requires valid code

Inactivity auto-logout logs out user after 5 hours idle

All security changes logged

No cross-user access possible