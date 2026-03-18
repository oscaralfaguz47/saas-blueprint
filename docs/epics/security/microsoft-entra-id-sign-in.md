# EPIC — Microsoft Entra ID Sign-In

## Title
Implement Microsoft Entra ID Sign-In for our application with strict security, no blind
account linking, self-serve workspace creator onboarding, and invite-only workspace joining.

## Objective
Add Microsoft Entra ID as a first-class sign-in method in our application, alongside Google
and Magic Link, while preserving the existing authentication architecture:

- NextAuth v4 with Prisma Adapter
- JWT session strategy
- DB-backed `Session` rows for inactivity, revocation, and MFA gating
- existing first-time setup / draft-workspace bootstrap behavior
- existing invite acceptance flow with strict email match

The implementation must be secure, minimal, production-ready, and must not weaken the
existing authentication model.

---

## Product Decisions (fixed)
These decisions are part of this EPIC and should not be re-litigated during implementation:

1. Our application will use **one global Microsoft Entra app registration** for the whole product.
2. The app registration must support **organizational accounts only** (`organizations`), not
   personal Microsoft accounts.
3. New users signing in with Microsoft for the first time are allowed to create their own
   application account and later bootstrap a workspace.
4. Joining an existing workspace remains **invite-only**.
5. Existing invitations continue to rely on **strict email equality** between the signed-in
   user and the invitation email.
6. Do **not** enable automatic account linking between Google, Magic Link, and Microsoft.
7. Do **not** add tenant/domain allowlists in phase 1.
8. Do **not** request unnecessary Microsoft Graph scopes in phase 1.

---

## Non-Goals
This EPIC does **not** implement:

- SCIM
- SAML
- Entra tenant/domain allowlists
- Just-in-time role mapping from Entra groups
- linking an existing signed-in account to Microsoft from Settings
- Passkeys
- custom Microsoft Graph profile sync
- Microsoft profile photo ingestion

---

## Security Requirements

1. Microsoft sign-in must **not** weaken the current auth model.
2. Microsoft sign-in must still create the DB-backed session rows required by the application
   for:
   - MFA gating
   - inactivity checks
   - revocation
3. Existing invitation acceptance must remain strict:
   - if signed-in email does not match invitation email, acceptance must fail exactly as it
     does now.
4. Do not use email as the durable identity key for Microsoft users.
5. Do not blindly auto-link Microsoft to an existing application user by email.
6. Do not request `User.Read` in phase 1.
7. Do not fetch Microsoft profile photos in phase 1.
8. Preserve existing Google and Magic Link behavior unless explicitly called out in this EPIC.
9. **All providers** must check `isPlatformBlocked` at the start of the `signIn` callback.
   A blocked user must never be allowed through regardless of provider.

---

## ⚠️ Migration Warning — Breaking Change for Existing Users

Removing `allowDangerousEmailAccountLinking: true` from the Google provider is a **breaking
change** for any existing users who previously signed in with both Google and Magic Link
using the same email address.

After this change:
- Those users will receive an `OAuthAccountNotLinked` error when attempting Google sign-in
  if their primary account was created via Magic Link (or vice versa).
- They will need to use the same sign-in method they originally used.

**Before deploying to production:**
- Audit existing `Account` rows in the DB to identify users with both a `google` and an
  `email` provider account linked to the same `userId`.
- Decide whether to communicate this change to affected users or run a one-time migration.
- Do not remove `allowDangerousEmailAccountLinking` from Google silently in a production
  deployment without this audit.

---

## ⚠️ Secret Handling Warning

Never commit `MICROSOFT_ENTRA_ID_CLIENT_SECRET` (or any other secret) to `.env` if that
file is tracked by git.

- Use `.env.local` for local development (already in `.gitignore` by default in Next.js).
- Use Vercel Environment Variables for staging and production.
- The `.env` file in this repo is used only as a reference template with empty values.
  Keep it that way.

---

## Architecture Decisions

### 1) Microsoft provider mode
Use **Microsoft Entra ID** provider with explicit issuer:
```
https://login.microsoftonline.com/organizations/v2.0
```

Do not omit the issuer. If omitted, the provider could allow undesired account types
depending on defaults and future changes.

The issuer must be set via the `MICROSOFT_ENTRA_ID_ISSUER` environment variable.
The code must also include a hardcoded safe default fallback:
```ts
issuer:
  process.env.MICROSOFT_ENTRA_ID_ISSUER ??
  "https://login.microsoftonline.com/organizations/v2.0",
```

This fallback is a security safeguard: if the env var is accidentally missing, the provider
will still reject personal Microsoft accounts instead of falling back to an insecure default.
The hardcoded string `"https://login.microsoftonline.com/organizations/v2.0"` is not a
placeholder — it is the correct production value and must be kept exactly as written.

### 2) Scope minimization
Override the provider authorization scope to:
```
openid profile email
```

Do **not** keep the provider default `User.Read` scope in phase 1.

Reason:
- The application does not need Microsoft profile photos for sign-in.
- Least-privilege is the correct choice for a financial approvals SaaS.
- Fewer permissions means less attack surface and less complexity.

### 3) Provider profile mapping
Override the Microsoft provider `profile()` mapping to avoid photo fetches and to normalize
a usable login email.

Use:
- `id: profile.sub`
- `email: normalized email candidate`
- `name: profile.name ?? normalizedEmail ?? "Microsoft user"`
- `image: null`

Do **not** fetch Microsoft Graph profile photos.

### 4) Email handling policy
The application currently depends heavily on a normalized user email for:
- invitations
- session display
- workspace onboarding expectations

Therefore:
- first choice: `profile.email`
- fallback: `profile.preferred_username`
- accept only if the chosen value is a syntactically valid email address
- normalize to trimmed lowercase
- if neither yields a valid addressable email, deny sign-in by returning `false` from the
  `signIn` callback (NextAuth v4 does not support returning a redirect string from
  `signIn` — only `true` or `false` are valid return values)
- the user will land on the error page configured in `pages.error`; since `pages.error`
  is set to `"/auth/sign-in"`, the resulting URL will be
  `/auth/sign-in?error=MicrosoftEmailRequired`, which is handled by `getAuthErrorCopy`

This email is used as a login/contact address only, not as the durable Microsoft identity
key.

### 5) Account linking policy
Do not enable `allowDangerousEmailAccountLinking` for Microsoft.

Also remove `allowDangerousEmailAccountLinking: true` from the existing Google provider,
subject to the Migration Warning above.

Desired result:
- existing Auth.js v4 behavior remains in place
- if a user already exists with the same email but the provider account is not linked,
  sign-in fails with `OAuthAccountNotLinked`
- the application continues to require same-method sign-in unless explicit linking is
  implemented in a future EPIC

### 6) Tenant policy
Phase 1 does **not** enforce an Entra tenant allowlist.

Reason:
- The application supports self-serve onboarding for a finance manager creating a workspace
  for the first time.
- Existing workspace membership is already protected by the invitation flow.
- Tenant/domain allowlisting can be added later as a separate EPIC once real customer
  demand exists.

### 7) isPlatformBlocked enforcement (new — all providers)
The `signIn` callback must check `isPlatformBlocked` at the very beginning, before any
provider-specific logic. This check was previously absent from the implementation.
```ts
async signIn({ user }) {
  if (!user?.id) return false;

  const blockedCheck = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isPlatformBlocked: true },
  });
  if (blockedCheck?.isPlatformBlocked) return false;

  // ... rest of signIn logic
}
```

This ensures that no blocked user can sign in through any provider — Google, Magic Link,
or Microsoft.

### 8) Duplicate bootstrap call cleanup
The current codebase calls `runUserBootstraps` in both `callbacks.signIn` and
`events.signIn`. The `events.signIn` call is redundant because the callback already covers
it. Remove `runUserBootstraps` from `events.signIn` to avoid double execution on every
sign-in.

Keep `runUserBootstraps` only in:
- `callbacks.signIn` (for all sign-ins)
- `events.createUser` (for first-time user creation)

### 9) NextAuth v4 signIn callback return values
In NextAuth v4, the `signIn` callback only accepts `true` or `false` as return values.
Returning a string (redirect URL) is an Auth.js v5 feature and does **not** work in v4 —
the string is coerced to truthy and the user is allowed through.

Always return `false` to deny sign-in in NextAuth v4. The error code is communicated via
the `pages.error` redirect, which in this codebase points to `"/auth/sign-in"`, so the
user lands on `/auth/sign-in?error=<CODE>`.

### 10) Session row edge case (known behavior — do not fix in this EPIC)
When the Prisma adapter has not yet persisted a new OAuth user to the DB at the time the
`signIn` callback runs (first OAuth sign-in race condition), the current implementation
returns `true` early without creating a DB-backed session row. The `jwt` callback then
looks for an existing session row but finds none, leaving the JWT without a `sessionToken`.

This is existing behavior, not introduced by this EPIC. The retry loop in `callbacks.signIn`
(3 attempts with 100ms delay) is intentional and must not be removed during refactoring.
Defer a proper fix to a dedicated hardening EPIC.

---

## Files to Change

### A. `server/auth-options.ts`

Add Microsoft Entra provider, add `isPlatformBlocked` check, remove duplicate bootstrap
call from `events.signIn`, harden account-linking behavior, and ensure `pages.error`
points to `"/auth/sign-in"` so error codes land on the sign-in page.

Required changes:

1. Import Microsoft provider and its profile type
2. Add `normalizeMicrosoftEmail` helper function
3. Add Microsoft provider configuration with hardcoded issuer fallback
4. Remove `allowDangerousEmailAccountLinking: true` from Google provider (see Migration
   Warning)
5. Set `pages.error` to `"/auth/sign-in"` so all auth errors including
   `MicrosoftEmailRequired` redirect to the sign-in page with the error code in the URL
6. Add `isPlatformBlocked` check at the very start of `callbacks.signIn`, before any
   other logic
7. Add Microsoft-specific email validation inside `callbacks.signIn`, returning `false`
   if no valid email is found (NextAuth v4 — no string redirects)
8. Preserve current DB session creation behavior for MFA/inactivity/revocation
9. Preserve the existing retry loop (3 attempts, 100ms delay) for the adapter race
   condition — do not remove it
10. Remove `runUserBootstraps` from `events.signIn` (keep only in `callbacks.signIn`
    and `events.createUser`)
11. Optionally log provider metadata to `AuditLog` using existing schema if
    straightforward; otherwise skip audit writes in phase 1 rather than introducing
    fragile auth coupling

#### Complete updated `server/auth-options.ts`
```ts
import "server-only";
import { randomBytes } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import MicrosoftEntraID, {
  type MicrosoftEntraIDProfile,
} from "next-auth/providers/microsoft-entra-id";
import { Resend } from "resend";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";
import { ensureBootstrapPlatformOwner } from "@/server/services/platform-bootstrap";
import { isMfaEnforcedForUser } from "@/server/security/member-security-governance";

// ---- Tunables (performance + security) ----
// JWT max age (seconds). 8 hours.
const JWT_MAX_AGE_SECONDS = 8 * 60 * 60;

// Rolling refresh window (refresh role at most every x minutes)
const ROLE_REFRESH_WINDOW_SECONDS = 15 * 60;

// Initialize Resend lazily to avoid issues during build
function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
}

// ---------------------------------------------------------------------------
// Microsoft email normalization helper
// ---------------------------------------------------------------------------
// Tries profile.email first, then profile.preferred_username as fallback.
// Normalizes to trimmed lowercase. Returns null if neither yields a valid
// addressable email. The result is used as login/contact address only —
// profile.sub is the durable Microsoft identity key.
function normalizeMicrosoftEmail(
  profile: MicrosoftEntraIDProfile
): string | null {
  const candidates = [
    typeof profile.email === "string" ? profile.email : null,
    typeof profile.preferred_username === "string"
      ? profile.preferred_username
      : null,
  ]
    .map((v) => v?.trim().toLowerCase() ?? null)
    .filter(Boolean) as string[];

  const valid = candidates.find((value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
  return valid ?? null;
}

async function runUserBootstraps(params: {
  userId: string;
  email?: string | null;
}) {
  if (!params.userId) return;
  await ensureBootstrapPlatformOwner({
    userId: params.userId,
    email: params.email ?? undefined,
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: JWT_MAX_AGE_SECONDS,
    updateAge: ROLE_REFRESH_WINDOW_SECONDS,
  },
  jwt: {
    maxAge: JWT_MAX_AGE_SECONDS,
  },

  // ---------------------------------------------------------------------------
  // pages — error points to sign-in so error codes appear as
  // /auth/sign-in?error=<CODE> and are handled by getAuthErrorCopy
  // ---------------------------------------------------------------------------
  pages: {
    signIn: "/auth/sign-in",
    signOut: "/auth/sign-out",
    error: "/auth/sign-in",
  },

  // ---------------------------------------------------------------------------
  // providers
  // ---------------------------------------------------------------------------
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // allowDangerousEmailAccountLinking intentionally removed.
      // See Migration Warning in EPIC before deploying to production.
    }),

    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET ?? "",
      // Hardcoded safe default: if the env var is accidentally missing, the
      // provider still restricts to organizational accounts only and never
      // falls back to an insecure issuer. This string is the correct
      // production value — it is not a placeholder.
      issuer:
        process.env.MICROSOFT_ENTRA_ID_ISSUER ??
        "https://login.microsoftonline.com/organizations/v2.0",
      authorization: {
        params: {
          // Minimal scopes only. Do not add User.Read in phase 1.
          scope: "openid profile email",
        },
      },
      profile(profile) {
        const normalizedEmail = normalizeMicrosoftEmail(profile);
        return {
          // Use sub as the durable identity key, not email.
          id: profile.sub,
          name: profile.name ?? normalizedEmail ?? "Microsoft user",
          email: normalizedEmail,
          // Never fetch or store Microsoft profile photos in phase 1.
          image: null,
        };
      },
    }),

    EmailProvider({
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const resendInstance = getResend();
        await resendInstance.emails.send({
          from: provider.from as string,
          to: identifier,
          subject: "Sign in to your account",
          html: `
            <p>Click the link below to sign in:</p>
            <p><a href="${url}">Sign in</a></p>
            <p>If you did not request this, ignore this email.</p>
          `,
        });
      },
    }),
  ],

  // ---------------------------------------------------------------------------
  // callbacks
  // ---------------------------------------------------------------------------
  callbacks: {
    // Run before jwt callback so the new session exists when we attach
    // sessionToken (avoids sign-out loop).
    async signIn({ user, account }) {
      if (!user?.id) return false;

      // ── 1. isPlatformBlocked check (applies to ALL providers) ─────────────
      // Must be the very first check. A blocked user must never complete
      // sign-in regardless of which provider they use.
      const blockedCheck = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isPlatformBlocked: true },
      });
      if (blockedCheck?.isPlatformBlocked) return false;

      // ── 2. Microsoft-specific: validate that a usable email was provided ───
      // The profile() mapping already normalizes the email, but we enforce
      // the constraint here at the callback boundary as a hard gate.
      // NOTE: NextAuth v4 does not support returning a redirect string from
      // signIn. We return false and rely on pages.error → "/auth/sign-in"
      // so the user lands on /auth/sign-in?error=MicrosoftEmailRequired.
      if (account?.provider === "microsoft-entra-id") {
        const emailCandidate = user.email;
        const isValidEmail =
          typeof emailCandidate === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate);

        if (!isValidEmail) {
          return false;
        }
        // Do not special-case auto-linking for Microsoft.
        // Standard OAuthAccountNotLinked behavior applies if this email
        // already exists under a different provider.
      }

      // ── 3. Wait for adapter to persist user (first OAuth sign-in race) ────
      // The Prisma adapter may not have written the User row yet when this
      // callback fires on the very first OAuth sign-in. Retry up to 3 times.
      // Do not remove this retry loop — it handles a known NextAuth v4 race.
      let userExists: { id: string } | null = null;
      for (let i = 0; i < 3; i++) {
        userExists = await prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true },
        });
        if (userExists) break;
        if (i < 2) await new Promise((r) => setTimeout(r, 100));
      }

      if (!userExists) {
        // Known limitation: DB session row is not created on this request
        // when the adapter race fires. The jwt callback will attempt to
        // attach a session on the next request. Defer fix to a hardening EPIC.
        return true;
      }

      // ── 4. Bootstrap platform owner / admin (idempotent) ──────────────────
      await runUserBootstraps({ userId: user.id, email: user.email });

      // ── 5. MFA gating + DB session row creation ───────────────────────────
      // Creates DB-backed Session row for inactivity checks, revocation,
      // and MFA gating. This logic applies to all providers including Microsoft.
      const [security, mfaEnforced] = await Promise.all([
        prisma.userSecurity.findUnique({
          where: { userId: user.id },
          select: { totpEnabled: true },
        }),
        isMfaEnforcedForUser(user.id),
      ]);

      const now = new Date();
      const sessionToken = randomBytes(32).toString("base64url");
      const needsMfaChallenge =
        security?.totpEnabled || (mfaEnforced && !security?.totpEnabled);

      if (needsMfaChallenge) {
        const challengeExpires = new Date(now.getTime() + 10 * 60 * 1000);
        const expires = new Date(now.getTime() + 60 * 60 * 1000);
        await prisma.session.create({
          data: {
            sessionToken,
            userId: user.id,
            expires,
            authLevel: "PENDING_MFA",
            mfaChallengeExpiresAt: challengeExpires,
          },
        });
      } else {
        const expires = new Date(Date.now() + JWT_MAX_AGE_SECONDS * 1000);
        await prisma.session.create({
          data: {
            sessionToken,
            userId: user.id,
            expires,
            authLevel: "FULL",
            mfaVerifiedAt: now,
          },
        });
      }

      return true;
    },

    async jwt({ token, user, trigger }) {
      if (token.iat == null) {
        token.iat = Math.floor(Date.now() / 1000);
      }

      if (user?.id && (trigger === "signIn" || !token.sessionToken)) {
        const [security, mfaEnforced] = await Promise.all([
          prisma.userSecurity.findUnique({
            where: { userId: user.id },
            select: { totpEnabled: true },
          }),
          isMfaEnforcedForUser(user.id),
        ]);

        const needsMfa =
          security?.totpEnabled || (mfaEnforced && !security?.totpEnabled);

        const sessionRow = needsMfa
          ? await prisma.session.findFirst({
              where: {
                userId: user.id,
                revokedAt: null,
                authLevel: "PENDING_MFA",
              },
              orderBy: { id: "desc" },
              select: { sessionToken: true },
            })
          : await prisma.session.findFirst({
              where: { userId: user.id, revokedAt: null },
              orderBy: { id: "desc" },
              select: { sessionToken: true },
            });

        if (sessionRow) token.sessionToken = sessionRow.sessionToken;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
        session.user.iat = token.iat ?? undefined;
        session.user.sessionToken = token.sessionToken ?? undefined;

        if (token.sub) {
          const [sessionRow, security, mfaEnforced, userRecord] =
            await Promise.all([
              token.sessionToken
                ? prisma.session.findUnique({
                    where: { sessionToken: token.sessionToken },
                    select: {
                      mfaVerifiedAt: true,
                      authLevel: true,
                      revokedAt: true,
                      mfaChallengeExpiresAt: true,
                      expires: true,
                    },
                  })
                : prisma.session.findFirst({
                    where: { userId: token.sub, revokedAt: null },
                    orderBy: { id: "desc" },
                    select: {
                      mfaVerifiedAt: true,
                      authLevel: true,
                      revokedAt: true,
                      mfaChallengeExpiresAt: true,
                      expires: true,
                    },
                  }),
              prisma.userSecurity.findUnique({
                where: { userId: token.sub },
                select: { totpEnabled: true },
              }),
              isMfaEnforcedForUser(token.sub),
              prisma.user.findUnique({
                where: { id: token.sub },
                select: { email: true, name: true },
              }),
            ]);

          const now = new Date();
          const isRevoked =
            sessionRow &&
            "revokedAt" in sessionRow &&
            sessionRow.revokedAt != null;
          const isPendingMfaExpired =
            sessionRow &&
            "authLevel" in sessionRow &&
            sessionRow.authLevel === "PENDING_MFA" &&
            ((sessionRow.mfaChallengeExpiresAt != null &&
              now > sessionRow.mfaChallengeExpiresAt) ||
              (sessionRow.expires != null && now > sessionRow.expires));

          session.user.authLevel =
            sessionRow && "authLevel" in sessionRow
              ? sessionRow.authLevel
              : "FULL";
          session.user.mfaVerified =
            !isRevoked &&
            !isPendingMfaExpired &&
            (sessionRow && "mfaVerifiedAt" in sessionRow
              ? sessionRow.mfaVerifiedAt != null
              : sessionRow != null);
          session.user.totpEnabled = security?.totpEnabled ?? false;
          session.user.mfaEnforced = mfaEnforced ?? false;
          session.user.email = userRecord?.email ?? session.user.email ?? null;
          session.user.name = userRecord?.name ?? session.user.name ?? null;
        }
      }

      return session;
    },
  },

  // ---------------------------------------------------------------------------
  // events
  // ---------------------------------------------------------------------------
  events: {
    async createUser({ user }) {
      // Bootstrap on first user creation (idempotent).
      await Promise.all([
        runUserBootstraps({ userId: user.id, email: user.email }),
        prisma.user.update({
          where: { id: user.id },
          data: { appearance: "DARK" },
        }),
      ]);

      const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "")
        .trim()
        .toLowerCase();
      const userEmail = (user.email ?? "").trim().toLowerCase();
      if (!bootstrapEmail || !userEmail) return;
      if (userEmail !== bootstrapEmail) return;

      const platformAdmin = await prisma.vendorRole.findUnique({
        where: { name: "PlatformAdmin" },
        select: { id: true },
      });
      if (!platformAdmin) return;

      await prisma.vendorUserRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: platformAdmin.id },
        },
        update: {},
        create: { userId: user.id, roleId: platformAdmin.id },
      });
    },

    // events.signIn intentionally has no runUserBootstraps call.
    // It is already called in callbacks.signIn which runs on every sign-in.
    // Adding it here again would cause double execution on every sign-in event.
    async signIn({ user }) {
      if (!user?.id) return;
      // Reserved for future non-bootstrap sign-in events (e.g. audit logging).
    },
  },
};
```

---

### B. `app/(auth)/auth/sign-in/signin-form.tsx`

Add Microsoft button, icon, status state, error handling, and updated copy.

Required changes:

1. Add `sending_microsoft` to the `Status` type union
2. Add `MicrosoftIcon` SVG component inline (same pattern as `GoogleIcon`) using the
   official 4-square Microsoft logo with exact brand colors:
   - Top-left: `#F25022` (red)
   - Top-right: `#7FBA00` (green)
   - Bottom-left: `#00A4EF` (blue)
   - Bottom-right: `#FFB900` (yellow)
3. Add `handleMicrosoft` handler that calls
   `await signIn("microsoft-entra-id", { callbackUrl })`
4. Update `isBusy` to include `sending_microsoft`
5. Disable all provider buttons while any flow is in progress
6. Add `microsoftemailrequired` case to `getFriendlyError`
7. Update `OAuthAccountNotLinked` copy to mention all three methods
8. Update tip text at the bottom
9. Add `aria-label` to both Google and Microsoft buttons for accessibility
10. Keep relative `callbackUrl` safety logic exactly as-is
11. Button order: Google → Microsoft → divider → Magic Link form

#### Complete updated `app/(auth)/auth/sign-in/signin-form.tsx`
```tsx
"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type Status =
  | { type: "idle" }
  | { type: "sending_email" }
  | { type: "sending_google" }
  | { type: "sending_microsoft" }
  | { type: "email_sent"; email: string }
  | { type: "error"; message: string };

function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

function getFriendlyError(messageOrCode?: string) {
  const raw = (messageOrCode ?? "").toLowerCase();

  if (raw.includes("oauthaccountnotlinked")) {
    return "This email was previously used with a different sign-in method. Please use the same method you used before (Google, Microsoft, or Magic Link).";
  }
  if (raw.includes("microsoftemailrequired")) {
    return "Your Microsoft account did not provide a usable email address. Please use a Microsoft work account with an addressable email, or sign in with Magic Link.";
  }
  if (raw.includes("verification")) {
    return "This sign-in link is no longer valid. Please request a new one and try again.";
  }
  if (raw.includes("emailsignin")) {
    return "We couldn't send the magic link. Please confirm the email address and try again.";
  }
  if (raw.includes("accessdenied")) {
    return "Access denied. You do not have permission to sign in.";
  }
  return "We couldn't sign you in. Please try again.";
}

function getSafeCallbackUrl(value: string | null) {
  if (!value) return "/app/requests";
  return value.startsWith("/") ? value : "/app/requests";
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="h-5 w-5"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.3l6.7-6.7C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.6c-.3 2-1.7 5-4.8 7.1l7.4 5.8c4.3-4 6.9-9.9 6.9-16.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.6c-.5-1.4-.8-2.8-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.8c-2 1.4-4.7 2.4-7.8 2.4-6.3 0-11.7-3.8-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 21 21"
      className="h-5 w-5"
      focusable="false"
    >
      <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
      <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
      <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => getSafeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const emailNormalized = normalizeEmail(email);
  const isBusy =
    status.type === "sending_email" ||
    status.type === "sending_google" ||
    status.type === "sending_microsoft";

  async function handleGoogle() {
    if (isBusy) return;
    setStatus({ type: "sending_google" });
    try {
      await signIn("google", { callbackUrl });
    } catch (e: unknown) {
      setStatus({
        type: "error",
        message: getFriendlyError(toErrorMessage(e)),
      });
    } finally {
      setTimeout(() => {
        setStatus((s) =>
          s.type === "sending_google" ? { type: "idle" } : s
        );
      }, 800);
    }
  }

  async function handleMicrosoft() {
    if (isBusy) return;
    setStatus({ type: "sending_microsoft" });
    try {
      await signIn("microsoft-entra-id", { callbackUrl });
    } catch (e: unknown) {
      setStatus({
        type: "error",
        message: getFriendlyError(toErrorMessage(e)),
      });
    } finally {
      setTimeout(() => {
        setStatus((s) =>
          s.type === "sending_microsoft" ? { type: "idle" } : s
        );
      }, 800);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;

    if (!emailNormalized) {
      setStatus({ type: "error", message: "Please enter your email address." });
      return;
    }
    if (!isValidEmail(emailNormalized)) {
      setStatus({
        type: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }

    setStatus({ type: "sending_email" });
    try {
      const res = await signIn("email", {
        email: emailNormalized,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setStatus({
          type: "error",
          message: getFriendlyError(res.error),
        });
        return;
      }
      setStatus({ type: "email_sent", email: emailNormalized });
    } catch (e: unknown) {
      setStatus({
        type: "error",
        message: getFriendlyError(toErrorMessage(e)),
      });
    }
  }

  function reset() {
    setStatus({ type: "idle" });
  }

  const showInlineHint = status.type === "email_sent";
  const showInlineError = status.type === "error";

  return (
    <div className="space-y-4">
      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={isBusy}
        aria-label="Continue with Google"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {status.type === "sending_google"
          ? "Signing in with Google..."
          : "Continue with Google"}
      </button>

      {/* Microsoft */}
      <button
        type="button"
        onClick={handleMicrosoft}
        disabled={isBusy}
        aria-label="Continue with Microsoft"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MicrosoftIcon />
        {status.type === "sending_microsoft"
          ? "Signing in with Microsoft..."
          : "Continue with Microsoft"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-(--border-subtle)" />
        <div className="text-xs font-medium text-(--text-muted)">or</div>
        <div className="h-px flex-1 bg-(--border-subtle)" />
      </div>

      {/* Magic link */}
      <form onSubmit={handleMagicLink} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-(--text-secondary)">
            Email
          </span>
          <input
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (
                status.type === "error" ||
                status.type === "email_sent"
              ) {
                setStatus({ type: "idle" });
              }
            }}
            placeholder="you@company.com"
            type="email"
            autoComplete="email"
            disabled={isBusy}
            className={[
              "h-11 w-full rounded-lg border bg-(--bg-main) px-3 text-sm text-(--text-primary) outline-none transition-colors",
              "placeholder:text-(--text-muted)",
              "focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)",
              "disabled:cursor-not-allowed disabled:opacity-60",
              showInlineError
                ? "border-(--color-danger)"
                : "border-(--border-subtle)",
            ].join(" ")}
          />
        </label>
        <button
          type="submit"
          disabled={isBusy || !emailNormalized}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.type === "sending_email"
            ? "Sending magic link..."
            : "Send magic link"}
        </button>
      </form>

      {/* Status: email sent */}
      {status.type === "email_sent" && (
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm">
          <div className="font-semibold text-(--text-primary)">
            Check your email
          </div>
          <div className="mt-1 text-(--text-secondary)">
            We sent a sign-in link to{" "}
            <span className="font-mono text-(--text-primary)">
              {status.email}
            </span>
            . If you don&apos;t see it, check Spam/Promotions.
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
          >
            Use a different email
          </button>
        </div>
      )}

      {/* Status: error */}
      {status.type === "error" && (
        <div className="rounded-xl border border-(--color-danger) bg-(--bg-surface) px-4 py-3 text-sm">
          <div className="font-semibold text-(--text-primary)">
            Sign-in error
          </div>
          <div className="mt-1 text-(--text-secondary)">{status.message}</div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bottom tip */}
      {!showInlineHint && (
        <p className="text-center text-xs text-(--text-muted)">
          Tip: Use Google or Microsoft for faster sign-in, or request a magic
          link.
        </p>
      )}
    </div>
  );
}
```

---

### C. `app/(auth)/auth/sign-in/page.tsx`

Update subtitle copy only. No logic changes.

Change:
```tsx
subtitle="No password required. Use Google or get a magic link."
```

To:
```tsx
subtitle="No password required. Use Google, Microsoft, or get a magic link."
```

---

### D. `lib/auth-errors.ts`

Required changes:

1. Add `MicrosoftEmailRequired` case
2. Update `OAuthAccountNotLinked` description to mention all three providers
3. Update `OAuthSignin` / `OAuthCallback` / `OAuthCreateAccount` to use
   provider-neutral wording

#### Complete updated `lib/auth-errors.ts`
```ts
export type AuthErrorCopy = {
  code: string;
  title: string;
  description: string;
};

export function getAuthErrorCopy(error?: string | null): AuthErrorCopy {
  const code = (error ?? "").trim() || "Verification";

  switch (code) {
    case "Verification":
      return {
        code,
        title: "This sign-in link is no longer valid",
        description:
          "Magic links can only be used once and may expire after a few minutes. Please request a new link and try again.",
      };

    case "Default":
      return {
        code,
        title: "This sign-in link is no longer valid",
        description:
          "The link may have expired, already been used, or is incomplete. Please request a new magic link and try again.",
      };

    case "EmailSignin":
      return {
        code,
        title: "We couldn't send the magic link",
        description:
          "Please try again in a moment. If the issue persists, verify your email address or check your email provider settings.",
      };

    case "OAuthAccountNotLinked":
      return {
        code,
        title: "This email is already registered",
        description:
          "This email was previously used with a different sign-in method. Please sign in using the same method as before (Google, Microsoft, or Magic Link).",
      };

    case "MicrosoftEmailRequired":
      return {
        code,
        title: "Microsoft account email required",
        description:
          "Your Microsoft account did not provide a usable email address for sign-in. Please use a Microsoft work account with an addressable email, or sign in with Magic Link.",
      };

    case "AccessDenied":
      return {
        code,
        title: "Access denied",
        description:
          "You do not have permission to sign in. If you believe this is a mistake, please contact support.",
      };

    case "Configuration":
      return {
        code,
        title: "Authentication is not configured correctly",
        description:
          "There is a configuration issue with the authentication setup. Please contact support (or check server logs in development).",
      };

    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
      return {
        code,
        title: "Single sign-on failed",
        description:
          "We couldn't complete sign-in with your account. Please try again. If it keeps happening, contact support.",
      };

    case "CredentialsSignin":
      return {
        code,
        title: "Sign-in failed",
        description:
          "We couldn't sign you in with the provided credentials. Please try again.",
      };

    case "SessionRequired":
      return {
        code,
        title: "Session required",
        description:
          "You must be signed in to access this page. Please sign in and try again.",
      };

    case "SessionExpired":
      return {
        code,
        title: "Session expired",
        description:
          "Your session expired due to inactivity or was signed out. Please sign in again.",
      };

    default:
      return {
        code,
        title: "Sign-in error",
        description:
          "Something went wrong while trying to sign you in. Please try again.",
      };
  }
}
```

---

### E. `middleware.ts`
No changes required.

`/api/auth` is already public and covers `/api/auth/callback/microsoft-entra-id`
without any additional rules. Do not introduce Microsoft-specific middleware logic
in this EPIC.

---

### F. `schema.prisma`
No changes required.

The canonical external-provider linkage already lives in the `Account` table. The
current auth/session model is already compatible with another OAuth provider. Phase 1
does not require persistent Entra tenant metadata. Do not repurpose
`User.identityProvider` / `User.identityId` as the source of truth for Microsoft
linkage — the `Account` table remains canonical.

---

### G. `app/api/tenant/invitations/accept/route.ts`
No changes required.

The current implementation already enforces strict email equality between the
signed-in user and the invitation email. That behavior must remain unchanged and works
correctly for Microsoft users once they have a normalized email stored on their `User`.

---

### H. `app/api/tenant/invitations/mine/route.ts`
No changes required.

This route already depends on the signed-in normalized email and will continue to
work correctly once Microsoft users have a normalized email stored on their `User`.

---

### I. `.env`
Add the following entries with empty values (template only — real values go in
`.env.local` for local dev and in Vercel Environment Variables for production):
```env
MICROSOFT_ENTRA_ID_CLIENT_ID=""
MICROSOFT_ENTRA_ID_CLIENT_SECRET=""
MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/organizations/v2.0"
```

Existing variables that must already remain correctly set:
```env
NEXTAUTH_URL=""
NEXTAUTH_SECRET=""
```

---

## Manual Microsoft Entra Setup
Must be done by the developer/admin — cannot be automated by Cursor.

1. Go to **Microsoft Entra admin center** →
   Identity → Applications → App registrations
2. Click **New registration**
3. Set the name (e.g. `Relitrue`)
4. Under **Supported account types**, choose:
   **Accounts in any organizational directory
   (Any Microsoft Entra ID tenant – Multitenant)**
   — do **not** select personal Microsoft accounts
5. Add **Web redirect URIs**:
   - Local: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - Production: `https://YOUR_PRODUCTION_DOMAIN/api/auth/callback/microsoft-entra-id`
6. Click **Register**
7. Go to **Certificates & secrets** → New client secret → copy the **Value** (not the ID)
8. Copy:
   - **Application (client) ID** → `MICROSOFT_ENTRA_ID_CLIENT_ID`
   - **Client secret value** → `MICROSOFT_ENTRA_ID_CLIENT_SECRET`
9. The issuer is always:
   `https://login.microsoftonline.com/organizations/v2.0`

---

## Acceptance Criteria

1. A brand-new user with a valid Microsoft organizational account can sign in successfully.
2. That new user reaches the same existing post-auth bootstrap path as Google/Magic Link
   users.
3. A user can create their own first workspace after first sign-in using the existing
   bootstrap flow.
4. Joining an existing workspace still requires an invitation.
5. Invitation acceptance still fails when signed-in email does not equal invitation email.
6. Personal Microsoft accounts cannot sign in.
7. Existing Google and Magic Link flows continue to work.
8. Microsoft sign-in does not request `User.Read`.
9. Microsoft sign-in does not fetch or store profile photos.
10. If a Microsoft account does not provide a usable email address, sign-in fails cleanly
    with the `MicrosoftEmailRequired` user-facing message on the sign-in page.
11. If the same email already exists under a different non-linked sign-in method, the user
    is not silently linked and instead gets the expected `OAuthAccountNotLinked` error.
12. Current MFA/inactivity/revocation logic still works for Microsoft sign-ins because
    DB-backed session rows are still created by the existing `signIn` callback path.
13. A platform-blocked user (`isPlatformBlocked: true`) cannot sign in through any
    provider — Google, Microsoft, or Magic Link.

---

## Test Plan

### Manual happy paths

1. New Microsoft organizational user signs in for the first time
2. Existing Microsoft user signs in again
3. Microsoft user receives invite and accepts it with matching email
4. Microsoft user with matching invitation email joins workspace successfully

### Manual conflict / error paths

5. Existing Magic Link user attempts Microsoft sign-in with same email
   → `OAuthAccountNotLinked`
6. Existing Google user attempts Microsoft sign-in with same email
   → `OAuthAccountNotLinked`
7. Microsoft account returns no usable email → `MicrosoftEmailRequired`
8. Personal Microsoft account attempts sign-in → rejected by Entra issuer
9. Platform-blocked user attempts sign-in via any provider → denied

### Regression checks

10. Google sign-in still works end-to-end
11. Magic Link still works end-to-end
12. Existing sign-out and sign-in pages still render correctly
13. Existing callback URL redirect behavior still works
14. Existing MFA-required session path still works
15. Existing inactivity expiration / sign-out loop prevention still works

### Error copy verification

Verify user-facing copy appears correctly for:

1. `OAuthAccountNotLinked` — mentions Google, Microsoft, and Magic Link
2. `OAuthCallback` — uses provider-neutral wording ("Single sign-on failed")
3. `AccessDenied` — unchanged
4. `MicrosoftEmailRequired` — appears when Microsoft provides no valid email

---

## Rollback Strategy

If rollout must be reversed:

1. Remove the Microsoft button from the sign-in UI
2. Remove the Microsoft provider from `authOptions`
3. Restore `allowDangerousEmailAccountLinking: true` on Google if it was removed and
   existing users need it (see Migration Warning)
4. Keep all existing `User` and `Account` rows in the DB untouched
5. Do not delete historical `Account` rows for Microsoft unless there is a strong
   migration reason

---

## Notes to Cursor

1. Do not rewrite the auth architecture.
2. Do not migrate to Auth.js v5-style handlers in this EPIC.
3. Do not change session strategy.
4. Do not replace DB-backed `Session` usage.
5. Do not touch invitation semantics.
6. Do not add Microsoft Graph usage.
7. Prefer minimal diffs and high-confidence changes.
8. Keep all comments in English.
9. Preserve all existing security behavior unless explicitly changed above.
10. Treat this as a security-sensitive implementation, not a UI-only feature.
11. The `isPlatformBlocked` check must be the **first** check in `callbacks.signIn`,
    before any provider-specific logic.
12. Do not add `runUserBootstraps` back to `events.signIn` — it was intentionally
    removed to avoid duplicate execution on every sign-in.
13. The hardcoded issuer fallback
    `"https://login.microsoftonline.com/organizations/v2.0"` is not a placeholder —
    it is the correct production value and must be kept exactly as written.
14. In `callbacks.signIn`, always return `false` to deny sign-in — never return a
    string. This is NextAuth v4. String redirects are Auth.js v5 only and will be
    silently treated as `true` (allow) in v4.
15. Do not remove the retry loop (3 attempts, 100ms delay) that waits for the Prisma
    adapter to persist a new user. It handles a known race condition on first OAuth
    sign-in and must stay in place.
16. Never commit real secret values to `.env`. Use `.env.local` for local development
    and Vercel Environment Variables for production.

---

## Implementation Summary

Implement Microsoft Entra ID as an additional OAuth provider using the `organizations`
issuer, no dangerous auto-linking, minimal scopes (`openid profile email`), no Graph
or photo fetch, a hardcoded safe issuer fallback, `isPlatformBlocked` enforcement for
all providers, removal of the duplicate bootstrap event call, correct NextAuth v4
`signIn` return values (`false` only — no string redirects), preservation of the
adapter race retry loop, and strict compatibility with the existing invitation and
session security model.