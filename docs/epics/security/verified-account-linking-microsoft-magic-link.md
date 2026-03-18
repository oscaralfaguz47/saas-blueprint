# EPIC — Verified Account Linking: Microsoft → Existing Magic Link Account

## Context and Current State

This implementation builds on top of the already-completed Microsoft Entra ID EPIC.
The current codebase has:

- Next.js App Router, React, Prisma, PostgreSQL
- NextAuth v4 with PrismaAdapter, JWT session strategy
- DB-backed `Session` rows for inactivity, revocation, and MFA gating
- Three providers: Google, Magic Link (Email), Microsoft Entra ID
- `pages.error` is set to `"/auth/sign-in"` — all auth errors including
  `OAuthAccountNotLinked` already land on `/auth/sign-in?error=<CODE>`
- `normalizeMicrosoftEmail(profile)` helper already exists in
  `server/auth-options.ts` — reuse it, do not rewrite it
- `randomBytes(32).toString("base64url")` is the existing pattern for secure tokens
- `crypto.createHash("sha256").update(token).digest("hex")` is the existing pattern
  for hashing tokens before DB storage — see `TenantInvitation.tokenHash` and
  `RememberedDevice.tokenHash` in schema.prisma
- `AuditLog` model already exists in schema.prisma with fields:
  `actorUserId`, `actorContext`, `tenantId`, `action`, `targetType`, `targetId`,
  `targetUserId`, `metadata`, `ipAddress`, `userAgent`, `createdAt`
- Magic Link sending logic currently lives inline inside `EmailProvider` in
  `server/auth-options.ts` using Resend — extract this into a shared
  `server/services/send-magic-link.ts` helper so both the Email provider and
  the link-account flow call the same function

## Problem Being Solved

When a user who originally signed up with Magic Link attempts to sign in with
Microsoft Entra ID using the same email address, NextAuth v4 throws
`OAuthAccountNotLinked` because the Microsoft provider is not linked to their
existing account.

Currently this shows a dead-end error. The goal is to replace it with a smooth,
secure, verified-linking flow.

## What Must NOT Change

- Auth architecture (no rewrite, no migration to Auth.js v5)
- JWT session strategy and DB-backed Session rows
- MFA gating, inactivity checks, revocation logic
- Invitation acceptance semantics (strict email match)
- `allowDangerousEmailAccountLinking` must remain absent from all providers
- No auto-linking purely because email matches
- No weakening of any existing security boundary

## Important NextAuth v4 Constraint

In NextAuth v4, the `signIn` callback only returns `true` or `false`.
Returning a string redirect does NOT work — strings are coerced to truthy
and the user passes through. This was already established in the previous EPIC.

To redirect the user to `/auth/link-account` after detecting a conflict, the
correct approach is:

1. Detect the conflict manually inside `callbacks.signIn` BEFORE NextAuth's
   adapter runs its own check — do this by querying the `Account` table directly
2. Create the `AuthLinkChallenge` row in DB
3. Set a short-lived, HttpOnly, Secure, SameSite=lax cookie containing only the
   challenge token (not the full challenge data)
4. Return `false` from `signIn` — this causes NextAuth to redirect to
   `pages.error` which is already `"/auth/sign-in"`
5. In the sign-in page or middleware, detect the presence of the linking cookie
   and redirect to `/auth/link-account?challenge=<token>`

Do NOT place new routes under `/api/auth/*` — that namespace is owned by
NextAuth and routes placed there can have unpredictable behavior.
Use `/api/link/start` and `/api/link/finalize` instead.

## Desired UX Flow

1. User clicks "Continue with Microsoft"
2. Microsoft OAuth completes successfully
3. In `callbacks.signIn`, before NextAuth's adapter conflict check:
   - query `Account` table for an existing account with the same normalized email
     but a different provider
   - if conflict found: create `AuthLinkChallenge`, set cookie, return `false`
   - if no conflict: continue normal sign-in
4. User lands on `/auth/sign-in` (via `pages.error`), linking cookie is detected,
   redirect to `/auth/link-account?challenge=<token>`
5. `/auth/link-account` page:
   - validates the challenge token (hashed lookup in DB)
   - shows friendly copy: "We found an existing Relitrue account for this email.
     To protect your account, we sent you a magic link to confirm and link your
     Microsoft account."
   - automatically sends the Magic Link email once on page load (server action or
     API call) using the shared `sendMagicLink` helper
   - shows resend button with cooldown (60 seconds minimum between resends)
   - does NOT leak whether the email exists beyond what is implied by the OAuth attempt
6. User receives Magic Link email and clicks it
7. NextAuth processes the Magic Link — user is now authenticated as the existing user
8. In `callbacks.signIn` for the Email provider, after successful magic-link auth:
   - check for a pending unconsumed `AuthLinkChallenge` tied to this userId
   - if found and valid: upsert the `Account` row for `microsoft-entra-id`,
     mark challenge consumed, write audit log, redirect to `callbackUrl`
   - if not found: continue normal magic-link sign-in (no change to existing behavior)
9. Future Microsoft sign-ins work normally — no extra step

## Prisma Schema Changes

Add the following model to `schema.prisma`. Do not modify any existing model.
```prisma
model AuthLinkChallenge {
  id                      String    @id @default(cuid())
  userId                  String
  email                   String    @db.VarChar(191)
  targetProvider          String    @db.VarChar(50)
  targetProviderAccountId String    @db.VarChar(191)
  // Optional: Entra tenant ID from the oid/tid claim if available
  targetProviderTenantId  String?   @db.VarChar(191)
  callbackUrl             String?   @db.VarChar(500)
  // Store only the SHA-256 hash of the token — never the raw token
  // Raw token is sent in the cookie and URL only, never persisted
  tokenHash               String    @unique @db.VarChar(64)
  expiresAt               DateTime
  consumedAt              DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@index([tokenHash])
}
```

Also add the relation field to the `User` model:
```prisma
authLinkChallenges AuthLinkChallenge[]
```

## Token Security Pattern

Follow the exact same pattern used by `TenantInvitation` and `RememberedDevice`:
```ts
import { randomBytes, createHash } from "node:crypto";

// Generate
const rawToken = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(rawToken).digest("hex");

// Store: tokenHash in DB
// Transmit: rawToken in cookie / URL only

// Verify
const tokenHash = createHash("sha256").update(rawToken).digest("hex");
const challenge = await prisma.authLinkChallenge.findUnique({
  where: { tokenHash },
});
```

## Files to Create or Modify

### 1. `server/lib/cookie-names.ts` (new)
Create a server-side helper that builds cookie names dynamically from the
`APP_NAME` environment variable so the app is portable across deployments
and rebrands without hardcoded strings.
```ts
import "server-only";
// sendMagicLink({ email, url, from }: { email: string; url: string; from: string })
// Sends the same magic link email that EmailProvider currently sends inline.
// Used by both EmailProvider and the link-account flow.
```
/**
 * Returns the name of the link-challenge cookie derived from APP_NAME.
 *
 * APP_NAME="RELITRUE"  → "__relitrue_link_challenge"
 * APP_NAME="My App"    → "__my-app_link_challenge"
 * APP_NAME unset       → "__app_link_challenge"  (safe fallback)
 *
 * Must be called at runtime — not at module load time — so that the env
 * var is always resolved from the current process environment.
 */
export function getLinkChallengeCookieName(): string {
  const appName = (process.env.APP_NAME ?? "app")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return `__${appName}_link_challenge`;
}
```

> ⚠️ Ensure `APP_NAME` is defined in all environments (local, staging,
> production). If it is missing in any environment, the cookie will fall
> back to `__app_link_challenge`, which will break the linking flow if other
> environments use a different value. Your `.env` already has
> `APP_NAME="Relitrue"` — verify this is set in Vercel Environment Variables
> as well.

### 2. `server/auth-options.ts` (modify)
- Update `EmailProvider` to call `sendMagicLink` from the new helper
- In `callbacks.signIn`, add conflict detection for Microsoft before NextAuth's
  adapter check:
  - query `Account` table by normalized email to detect provider conflict
  - if conflict: create `AuthLinkChallenge`, set cookie, return `false`
  - after successful Magic Link auth: check for pending challenge, finalize linking
- Do not change any other existing logic in this file

### 3. `schema.prisma` (modify)
- Add `AuthLinkChallenge` model as specified above
- Add `authLinkChallenges AuthLinkChallenge[]` relation to `User` model
- Run `prisma migrate dev --name add_auth_link_challenge`

### 4. `app/(auth)/auth/link-account/page.tsx` (new)
- Server component that reads `challenge` from searchParams
- Validates challenge token via hashed DB lookup
- If invalid/expired: shows clear error with link back to sign-in
- If valid: renders `LinkAccountForm` client component
- Use the same `AuthCard` component already used by `/auth/sign-in`

### 5. `app/(auth)/auth/link-account/link-account-form.tsx` (new)
- Client component
- On mount: calls `/api/link/send-email` once to trigger Magic Link send
- Shows status: sending → sent → resend available after 60s cooldown
- Shows friendly copy as specified in UX Flow step 5
- Matches existing sign-in form UI style exactly (same Tailwind classes, same
  card patterns, same error/success box patterns)

### 6. `app/api/link/send-email/route.ts` (new)
- POST handler (not under `/api/auth/`)
- Requires valid challenge token in request body
- Validates challenge exists, not expired, not consumed
- Rate limits: max 3 sends per challenge, minimum 60s between sends
- Generates a NextAuth magic link URL using `generateMagicLinkUrl` or equivalent
- Calls `sendMagicLink` helper
- Writes `auth.link.challenge.sent` to `AuditLog`
- Returns `{ ok: true }` or `{ error: string }`

### 7. `app/api/link/finalize/route.ts` (new — optional)
Only needed if finalization cannot happen cleanly inside `callbacks.signIn`.
If `callbacks.signIn` can handle finalization after Magic Link auth (preferred),
this route is not needed. Decide based on implementation clarity.

### 8. `app/(app)/settings/security/page.tsx` or equivalent (modify or create)
- Show current linked sign-in methods
- If Microsoft is not linked: show "Link Microsoft" button
- "Link Microsoft" initiates a new Microsoft OAuth flow with a `link=true`
  query param or similar signal
- Requires `authLevel === "FULL"` session (check using `getServerSession` +
  `session.user.authLevel`)
- After linking completes, show updated state

### 9. `lib/auth-errors.ts` (modify)
- Add or update copy so users never see the raw `OAuthAccountNotLinked` dead-end
  when the account can be safely linked through the new flow
- The new flow intercepts that case before the error shows, but keep the error
  copy updated as a fallback for cases the flow cannot handle

## Audit Logging

Use the existing `AuditLog` model. Write logs for:
```ts
// Challenge created
await prisma.auditLog.create({
  data: {
    actorUserId: userId,
    actorContext: "TENANT",
    action: "auth.link.challenge.created",
    targetType: "AuthLinkChallenge",
    targetId: challenge.id,
    metadata: { targetProvider: "microsoft-entra-id", email },
  },
});

// Magic Link sent for linking
await prisma.auditLog.create({
  data: {
    actorUserId: userId,
    actorContext: "TENANT",
    action: "auth.link.challenge.sent",
    targetType: "AuthLinkChallenge",
    targetId: challenge.id,
    metadata: { email },
  },
});

// Linking completed
await prisma.auditLog.create({
  data: {
    actorUserId: userId,
    actorContext: "TENANT",
    action: "auth.link.completed",
    targetType: "User",
    targetId: userId,
    metadata: { linkedProvider: "microsoft-entra-id" },
  },
});

// Linking failed
await prisma.auditLog.create({
  data: {
    actorUserId: userId,
    actorContext: "TENANT",
    action: "auth.link.failed",
    targetType: "AuthLinkChallenge",
    targetId: challenge.id,
    metadata: { reason, targetProvider: "microsoft-entra-id" },
  },
});
```

## Security Constraints (non-negotiable)

1. Never auto-link purely because email matches — always require Magic Link verification
2. Never trust Microsoft email claim as sole identity proof
3. `AuthLinkChallenge` must be:
   - short-lived: 15 minutes (`expiresAt = now + 15 * 60 * 1000`)
   - one-time-use: check `consumedAt` is null before using
   - token stored only as SHA-256 hash in DB
   - raw token transmitted only in HttpOnly, Secure, SameSite=lax cookie
     and in the URL param for the link-account page
4. On finalization, validate ALL of:
   - challenge exists
   - challenge not expired (`expiresAt > now`)
   - challenge not consumed (`consumedAt === null`)
   - signed-in userId matches `challenge.userId`
   - `targetProviderAccountId` matches the Microsoft account being linked
5. Fail closed on any ambiguity — do not partially complete a link
6. If the Microsoft account is already linked to this same user, skip challenge
   creation and continue normal sign-in
7. If the Microsoft account is already linked to a DIFFERENT user, fail closed
   with a safe error — do not expose which user owns it
8. Cookie for challenge token:
   - name: derived at runtime from `APP_NAME` env var using
     `getLinkChallengeCookieName()` from `server/lib/cookie-names.ts`
     — never hardcode the cookie name inline
   - Example: `APP_NAME="RELITRUE"` → `__relitrue_link_challenge`
   - HttpOnly: true
   - Secure: true (production), false (development) — use
     `process.env.NODE_ENV === "production"` to set this dynamically
   - SameSite: lax
   - MaxAge: 900 (15 minutes, matches challenge TTL)
   - Path: /auth

   Usage pattern everywhere the cookie is read or written:
```ts
   import { getLinkChallengeCookieName } from "@/server/lib/cookie-names";

   const COOKIE_NAME = getLinkChallengeCookieName();
```
9. Clear the linking cookie after successful finalization or on any failure

## Settings Linking Path

For the `/settings/security` manual linking flow:
- Use `getServerSession(authOptions)` and verify `session.user.authLevel === "FULL"`
- If `authLevel === "PENDING_MFA"`, redirect to MFA step before allowing linking
- The "Link Microsoft" button initiates a standard Microsoft OAuth flow
- Signal the intent to link (not sign in) via a separate cookie or URL param so
  `callbacks.signIn` knows to treat this as a linking attempt rather than a sign-in
- After linking, redirect back to `/app/settings/security` with a success indicator

## Notes to Cursor

1. Do not rewrite auth-options.ts from scratch — make surgical additions only
2. Do not change JWT strategy, session strategy, MFA logic, or inactivity checks
3. Do not place routes under `/api/auth/` — use `/api/link/` instead
4. The `normalizeMicrosoftEmail` function already exists in `server/auth-options.ts`
   — import and reuse it, do not duplicate it
5. The `sendMagicLink` extraction must not break the existing Email provider flow —
   test that Magic Link sign-in still works after the refactor
6. Keep all comments in English
7. Prefer minimal, explicit, production-grade code over clever abstractions
8. The `AuthCard` component already exists at `components/auth/auth-card.tsx` —
   use it for the link-account page
9. Match the exact Tailwind class patterns from `signin-form.tsx` for any new
   form components
10. SHA-256 hashing: use `createHash("sha256").update(token).digest("hex")`
    from `node:crypto` — same as `TenantInvitation` pattern
11. In NextAuth v4, `callbacks.signIn` cannot return a redirect string —
    use the cookie + `return false` pattern described above
12. Do not add `targetProviderTenantId` to the cookie — only the raw challenge
    token goes in the cookie
13. Clean up expired and consumed `AuthLinkChallenge` rows via the existing
    cron job infrastructure if one exists, or note it as a future cleanup task
14. Never hardcode the link-challenge cookie name as a string literal anywhere
    in the codebase. Always call `getLinkChallengeCookieName()` from
    `server/lib/cookie-names.ts` at runtime. This applies to every place the
    cookie is set, read, or cleared — `auth-options.ts`, route handlers,
    middleware, and any server actions.

## Delivery Checklist

At the end of implementation, provide:

1. Summary of all files changed or created
2. Prisma migration file name and the SQL it generates
3. List of all new routes and pages
4. Any new environment variables (there should be none — this reuses existing infra)
5. Manual test steps for:
   a. New Microsoft user with no existing account → normal sign-in
   b. Magic Link user attempts Microsoft → guided through link flow → clicks
      magic link → Microsoft linked → subsequent Microsoft logins work
   c. Repeated Microsoft login after linking (should work normally)
   d. Expired challenge case (wait >15 min or manually set expiresAt in past)
   e. Already-linked case (Microsoft already linked to same user → normal sign-in)
   f. Conflict case (Microsoft account linked to a different user → fail closed)
   g. Manual linking from Settings > Security while signed in