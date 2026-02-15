# Postman Testing Guide — Security 2FA & Sessions

Use this guide to manually test all endpoints from **security-2fa-sessions.md** with Postman.

**Base URL:** `http://localhost:3000` (or your `NEXTAUTH_URL`)

**Auth:** This app uses **cookie-based sessions** (NextAuth JWT in a cookie). You must send the session cookie with every authenticated request.

---

## 1. Getting a session cookie (for Postman)

The app does not expose a “login API” that returns a token. Sign-in is via:

- **Google OAuth** or **Magic link** (browser flow).

### Option A — Copy cookie from browser after login

1. Open the app in the browser (e.g. `http://localhost:3000`).
2. Sign in (Google or magic link).
3. Open DevTools → **Application** (Chrome) or **Storage** (Firefox) → **Cookies** → select your origin.
4. Find the session cookie:
   - **Dev (HTTP):** `next-auth.session-token`
   - **Prod (HTTPS):** `__Secure-next-auth.session-token`
5. Copy its **Value**.
6. In Postman, for each request that needs auth:
   - **Headers** tab: add  
     `Cookie` → `next-auth.session-token=<paste value>`  
     (or `__Secure-next-auth.session-token=...` in prod).
   - Or use Postman **Cookies** (via “Cookies” link under Send) and set the cookie for your base URL.

### Option B — Postman “Send cookies” from browser (if supported)

Some Postman versions can capture cookies from a browser session; use that if available so you don’t copy manually.

---

## 2. Endpoints overview

| # | Method | Path | Purpose |
|---|--------|------|--------|
| 1 | GET | `/api/account/me` | Get profile + security flags (totpEnabled, backupCodesGeneratedAt, etc.) |
| 2 | POST | `/api/account/2fa/setup` | Start 2FA setup (get QR / manual key) |
| 3 | GET | `/api/account/2fa/setup-status` | Check if pending 2FA setup (get QR again) |
| 4 | POST | `/api/account/2fa/verify` | **Account** verify: complete 2FA setup OR in-app re-verify |
| 5 | POST | `/api/auth/2fa/verify` | **Login** MFA: verify code for PENDING_MFA session, rotate to FULL, optional remember device |
| 6 | POST | `/api/auth/2fa/cancel` | Cancel PENDING_MFA (sign out from 2FA screen) |
| 7 | POST | `/api/account/2fa/disable` | Disable 2FA (step-up + TOTP or backup code) |
| 8 | POST | `/api/account/2fa/backup-codes/regenerate` | Regenerate backup codes (step-up + TOTP) |
| 9 | PATCH | `/api/account/auto-logout` | Toggle/duration for inactivity auto-logout (step-up) |

---

## 3. Request/response details

Use **Base URL** + path. Send the session cookie on every request below unless stated otherwise.

---

### 1) GET `/api/account/me`

**Auth:** Required (session cookie).

**Headers:**  
`Cookie: next-auth.session-token=<your token>`

**Body:** None.

**Success (200):**
```json
{
  "data": {
    "profile": { "id", "name", "email", "phone", "timezone", "appearance", "avatarUrl" },
    "loginMethod": "Signed in with Google" | "Signed in with Magic link / Email",
    "security": {
      "totpEnabled": false,
      "autoLogoutEnabled": false,
      "autoLogoutMinutes": 300,
      "backupCodesGeneratedAt": null
    }
  }
}
```

**Use:** Check `security.totpEnabled` and `security.backupCodesGeneratedAt` before/after 2FA flows.

**When session is PENDING_MFA or 2FA not yet verified:** Returns **401** with `details.code: "MFA_REQUIRED"` and message "Complete two-factor authentication to continue." (All protected API routes enforce this.)

---

### 2) POST `/api/account/2fa/setup`

**Auth:** Required (FULL session).  
**Rate limit:** 3/min.

**Headers:**  
`Content-Type: application/json`  
`Cookie: next-auth.session-token=<token>`

**Body:** None.

**Success (200):**
```json
{
  "data": {
    "otpauthUri": "otpauth://totp/...",
    "manualKey": "JBSWY3DPEHPK3PXP"
  }
}
```

**Use:** Start 2FA enrollment. Then verify with `/api/account/2fa/verify` using a code from an authenticator app.

---

### 3) GET `/api/account/2fa/setup-status`

**Auth:** Required.

**Success (200):**
- Pending setup: `{ "data": { "pending": true, "otpauthUri": "...", "manualKey": "..." } }`
- No pending: `{ "data": { "pending": false } }`

---

### 4) POST `/api/account/2fa/verify` (account flow)

**Auth:** Required.  
**Rate limit:** 5/min.

**When to use:**  
- Right after **2FA setup**: send the first 6-digit code from the app to **complete enrollment** (response includes one-time `backupCodes`).  
- **In-app re-verify** only (e.g. after session refresh); does **not** rotate session.

**Headers:**  
`Content-Type: application/json`  
`Cookie: next-auth.session-token=<token>`

**Body:**
```json
{
  "code": "123456"
}
```
Or backup code (6–10 chars): `"code": "ABCD1234"`

**Success (200):**
- After setup: `{ "data": { "backupCodes": ["ABC12XYZ", ...], "verified": true } }`
- In-app verify: `{ "data": { "verified": true } }`

**Errors:**  
- 409 `NO_PENDING_2FA_SETUP` — no pending setup and not a valid login challenge (use `/api/auth/2fa/verify` for login).  
- 400 `INVALID_2FA_CODE` — wrong or used backup code.

---

### 5) POST `/api/auth/2fa/verify` (login MFA flow)

**Auth:** Required — session must be **PENDING_MFA** (i.e. you just signed in with 2FA enabled and were sent to the 2FA challenge).

**Rate limit:** 10/min.

**When to use:**  
- You have signed in in the browser and were redirected to `/auth/2fa` (so the session cookie is PENDING_MFA).  
- In Postman, use that **same** session cookie and send this request with a valid TOTP or backup code.  
- Response sets a **new** session cookie (session rotation); use the new cookie for subsequent requests.

**Headers:**  
`Content-Type: application/json`  
`Cookie: next-auth.session-token=<PENDING_MFA token>`

**Body:**
```json
{
  "code": "123456",
  "rememberDevice": true,
  "rememberDays": "30"
}
```
- `code`: 6-digit TOTP or backup code.  
- `rememberDevice`: optional boolean.  
- `rememberDays`: optional `"30"` | `"60"` | `"90"` (only used if `rememberDevice` is true).

**Success (200):**  
`{ "data": { "verified": true } }`  
Response also sets:
- New session cookie (replace your Postman cookie with this for further requests).
- Optional `__Host-rmd` (prod) or `rmd` (dev) cookie if `rememberDevice: true`.

**Errors:**  
- 401 `MFA_CHALLENGE_EXPIRED` — PENDING_MFA session expired.  
- 400 `INVALID_2FA_CODE`.

---

### 6) POST `/api/auth/2fa/cancel`

**Auth:** Optional (works with or without session).  
**Rate limit:** 30/min.

**When to use:** Simulate “Sign out” on the 2FA screen; revokes PENDING_MFA session and clears session cookie.

**Headers:**  
`Cookie: next-auth.session-token=<token>` (can be expired; still returns success)

**Body:** None.

**Success (200):**  
`{ "data": { "ok": true } }`  
Response clears the session cookie (e.g. `Max-Age=0`).

---

### 7) POST `/api/account/2fa/disable`

**Auth:** Required (FULL session).  
**Step-up:** Session must have completed MFA within the last 10 minutes (`mfaVerifiedAt`).  
**Rate limit:** 5/min.

**Headers:**  
`Content-Type: application/json`  
`Cookie: next-auth.session-token=<token>`

**Body:**
```json
{
  "code": "123456"
}
```
Or backup code: `"code": "ABCD1234"`

**Success (200):**  
`{ "data": { "ok": true } }`  
2FA disabled; all remembered devices revoked; `forceLogoutAt` set (other sessions will be forced out).

**Errors:**  
- 403 `STEP_UP_REQUIRED` — need to sign in again (or complete MFA &lt; 10 min ago).

---

### 8) POST `/api/account/2fa/backup-codes/regenerate`

**Auth:** Required (FULL session).  
**Step-up:** MFA verified within last 10 minutes.  
**Rate limit:** 5/min.

**Headers:**  
`Content-Type: application/json`  
`Cookie: next-auth.session-token=<token>`

**Body:**
```json
{
  "code": "123456"
}
```
Must be **TOTP** (6 digits), not a backup code.

**Success (200):**  
`{ "data": { "backupCodes": ["NEW1CODE", ...] } }`  
New codes returned once; all remembered devices revoked.

**Errors:**  
- 403 `STEP_UP_REQUIRED`.

---

### 9) PATCH `/api/account/auto-logout`

**Auth:** Required (FULL session).  
**Step-up:** MFA verified within last 10 minutes.

**Headers:**  
`Content-Type: application/json`  
`Cookie: next-auth.session-token=<token>`

**Body:**
```json
{
  "enabled": true,
  "minutes": 30
}
```
- `enabled`: boolean.  
- `minutes`: required when `enabled` is true; one of `15`, `30`, `60`, `300`, `480` (15m, 30m, 1h, 5h, 8h).

**Success (200):**  
`{ "data": { "enabled": true, "minutes": 30 } }`

**Errors:**  
- 403 `STEP_UP_REQUIRED`.  
- 400 if `minutes` missing when `enabled: true` or not in allowlist.

---

## 4. Suggested test flows (order)

### A. 2FA enrollment and login with 2FA

1. **Get a normal session**  
   Sign in in the browser (no 2FA yet), copy the session cookie into Postman.

2. **Check security state**  
   `GET /api/account/me` → `security.totpEnabled` should be false.

3. **Start 2FA setup**  
   `POST /api/account/2fa/setup` → copy `otpauthUri` or `manualKey` into an authenticator app.

4. **Complete 2FA setup**  
   `POST /api/account/2fa/verify` with body `{ "code": "<from app>" }` → save the returned `backupCodes` somewhere safe.

5. **Check again**  
   `GET /api/account/me` → `security.totpEnabled: true`, `security.backupCodesGeneratedAt` set.

6. **Trigger login MFA**  
   In the browser: sign out, then sign in again. You should be redirected to `/auth/2fa`.  
   Copy the **current** session cookie (this one is PENDING_MFA).

7. **Verify login MFA in Postman**  
   `POST /api/auth/2fa/verify` with that cookie and body e.g.  
   `{ "code": "<TOTP or backup code>", "rememberDevice": true, "rememberDays": "30" }`.  
   Copy the **new** session cookie from the response (or from the browser after redirect).

8. **Call an app endpoint with 2FA session**  
   e.g. `GET /api/account/me` with the new cookie → should return 200 with your profile.

### B. Cancel MFA (sign out from 2FA screen)

1. Sign in in the browser (with 2FA) so you land on `/auth/2fa`.  
2. Copy the PENDING_MFA session cookie.  
3. In Postman: `POST /api/auth/2fa/cancel` with that cookie.  
4. Expect `{ "data": { "ok": true } }` and cookie cleared.  
5. In browser, refresh or go to `/app` → should redirect to sign-in.

### C. Disable 2FA (step-up)

1. Have a **fresh** FULL session (sign in, complete 2FA, use session within 10 min).  
2. `POST /api/account/2fa/disable` with body `{ "code": "<TOTP or backup>" }`.  
3. Expect 200; then `GET /api/account/me` → `security.totpEnabled: false`.  
4. To test step-up: wait &gt;10 min (or use a session that hasn’t done MFA recently), call disable again → expect 403 `STEP_UP_REQUIRED`.

### D. Regenerate backup codes (step-up)

1. Fresh FULL session (MFA &lt; 10 min ago).  
2. `POST /api/account/2fa/backup-codes/regenerate` with body `{ "code": "<TOTP 6 digits>" }`.  
3. Expect 200 and new `backupCodes`.  
4. `GET /api/account/me` → `security.backupCodesGeneratedAt` updated.

### E. Auto-logout (step-up)

1. Fresh FULL session.  
2. `PATCH /api/account/auto-logout` with body `{ "enabled": true, "minutes": 1 }`.  
3. Expect 200.  
4. Wait 1+ minute without sending any request with that session.  
5. Next `GET /api/account/me` (or open `/app` in browser) → session should be expired (401 or redirect to sign-in).

---

## 5. Error response shape

All errors use this shape (possibly with `details.code` for known cases):

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": { "code": "STEP_UP_REQUIRED" }
}
```

Common `details.code` values:

- `MFA_REQUIRED` — session is PENDING_MFA or 2FA enabled but not yet verified; complete 2FA (e.g. POST /api/auth/2fa/verify) or sign in again.  
- `STEP_UP_REQUIRED` — re-auth or complete MFA within 10 min.  
- `MFA_CHALLENGE_EXPIRED` — PENDING_MFA session expired.  
- `NO_PENDING_2FA_SETUP` — no pending setup (account verify used in wrong context).  
- `INVALID_2FA_CODE` — wrong or already-used backup code.  
- 429 responses: `error: "RATE_LIMITED"`.

---

## 6. Quick reference — all endpoints

| Method | Path | Body | Notes |
|--------|------|------|--------|
| GET | `/api/account/me` | — | Profile + security flags |
| POST | `/api/account/2fa/setup` | — | Start 2FA (3/min) |
| GET | `/api/account/2fa/setup-status` | — | Pending setup? |
| POST | `/api/account/2fa/verify` | `{ "code" }` | Complete setup or in-app verify (5/min) |
| POST | `/api/auth/2fa/verify` | `{ "code", "rememberDevice?", "rememberDays?" }` | Login MFA (PENDING_MFA session, 10/min) |
| POST | `/api/auth/2fa/cancel` | — | Cancel 2FA / sign out (30/min) |
| POST | `/api/account/2fa/disable` | `{ "code" }` | Disable 2FA, step-up (5/min) |
| POST | `/api/account/2fa/backup-codes/regenerate` | `{ "code" }` | Regenerate codes, step-up (5/min) |
| PATCH | `/api/account/auto-logout` | `{ "enabled", "minutes?" }` | Auto-logout, step-up |

Always send:  
`Cookie: next-auth.session-token=<value>`  
(or `__Secure-next-auth.session-token` in HTTPS) for authenticated endpoints.
