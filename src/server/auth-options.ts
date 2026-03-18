import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import AzureADProvider from "next-auth/providers/azure-ad";
import type { AzureADProfile } from "next-auth/providers/azure-ad";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";

import { ensureBootstrapPlatformOwner } from "@/server/services/platform-bootstrap";
import { isMfaEnforcedForUser } from "@/server/security/member-security-governance";
import { sendMagicLink } from "@/server/services/send-magic-link";

// ---- Tunables (performance + security) ----
// JWT max age (seconds). 8 hours.
const JWT_MAX_AGE_SECONDS = 8 * 60 * 60;

// Rolling refresh window (refresh role at most every x minutes)
const ROLE_REFRESH_WINDOW_SECONDS = 15 * 60;

function linkIntentCookieName(provider: "azure-ad" | "google"): string {
  return `__link_intent_${provider.replace(/-/g, "_")}`;
}

/**
 * Settings → Link Google / Link Microsoft: cookie carries raw token; DB row
 * stores hash. Validates OAuth email matches the account that initiated the link.
 */
async function validateSettingsAccountLinkIntent(params: {
  provider: "azure-ad" | "google";
  normalizedIncomingEmail: string;
  resolvedUserId: string;
}): Promise<"allow_skip_conflict" | "deny" | "no_intent"> {
  try {
    const rawCookie = (await cookies()).get(linkIntentCookieName(params.provider))?.value;
    if (!rawCookie?.trim()) return "no_intent";
    let token = rawCookie.trim();
    try {
      token = decodeURIComponent(token);
    } catch {
      /* use trimmed raw */
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const intent = await prisma.accountLinkIntent.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expectedEmail: true,
        targetProvider: true,
        consumedAt: true,
        expiresAt: true,
      },
    });
    const now = new Date();
    if (
      !intent ||
      intent.consumedAt ||
      intent.expiresAt <= now ||
      intent.targetProvider !== params.provider
    ) {
      return "no_intent";
    }
    if (params.normalizedIncomingEmail !== intent.expectedEmail) {
      await prisma.accountLinkIntent.update({
        where: { id: intent.id },
        data: { consumedAt: now, errorCode: "email_mismatch" },
      });
      await prisma.auditLog.create({
        data: {
          actorUserId: intent.userId,
          actorContext: "TENANT",
          tenantId: null,
          action: "auth.link.failed",
          targetType: "AccountLinkIntent",
          targetId: intent.id,
          metadata: {
            reason: "email_mismatch",
            targetProvider: params.provider,
            expectedEmail: intent.expectedEmail,
            incomingEmail: params.normalizedIncomingEmail,
          },
        },
      });
      return "deny";
    }
    // Both Google and Azure AD use allowDangerousEmailAccountLinking so the
    // adapter resolves user.id to the existing account before signIn. Without
    // that, a different OAuth email can yield a different User row and this
    // check would falsely deny (or the intent would never align with user.id).
    if (params.resolvedUserId !== intent.userId) {
      await prisma.accountLinkIntent.update({
        where: { id: intent.id },
        data: { consumedAt: now },
      });
      await prisma.auditLog.create({
        data: {
          actorUserId: intent.userId,
          actorContext: "TENANT",
          tenantId: null,
          action: "auth.link.failed",
          targetType: "AccountLinkIntent",
          targetId: intent.id,
          metadata: {
            reason: "user_mismatch",
            targetProvider: params.provider,
            expectedEmail: intent.expectedEmail,
            resolvedUserId: params.resolvedUserId,
          },
        },
      });
      return "deny";
    }
    await prisma.accountLinkIntent.update({
      where: { id: intent.id },
      data: { consumedAt: now },
    });
    return "allow_skip_conflict";
  } catch {
    return "no_intent";
  }
}

// ---------------------------------------------------------------------------
// Microsoft Entra (Azure AD) email normalization
// ---------------------------------------------------------------------------
// Tries profile.email first, then profile.preferred_username as fallback.
// Normalizes to trimmed lowercase. Returns null if neither yields a valid
// addressable email. Used as login/contact only — profile.sub is the durable identity.
function normalizeMicrosoftEmail(profile: AzureADProfile & { preferred_username?: string | null }): string | null {
  const candidates = [
    typeof profile.email === "string" ? profile.email : null,
    typeof (profile as { preferred_username?: string }).preferred_username === "string"
      ? (profile as { preferred_username: string }).preferred_username
      : null,
  ]
    .map((v) => v?.trim().toLowerCase() ?? null)
    .filter(Boolean) as string[];

  const valid = candidates.find((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  return valid ?? null;
}

// Tenant segment for Entra issuer URL (e.g. "organizations"). Hardcoded safe default.
function getEntraTenantId(): string {
  const issuer = process.env.MICROSOFT_ENTRA_ID_ISSUER?.trim();
  if (!issuer) return "organizations";
  const match = issuer.match(/login\.microsoftonline\.com\/([^/]+)/i);
  return match ? match[1] : "organizations";
}

async function runUserBootstraps(params: { userId: string; email?: string | null }) {
  // Defensive guards (avoid unexpected nulls)
  if (!params.userId) return;

  // A5: No workspace creation on sign-in/createUser. First-time setup and DRAFT creation
  // happen when user hits /app (layout) or /setup/workspace (ensureDraftWorkspaceForUser).

  // Ensure platform owner/admin bootstrap (idempotent)
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
    // Rolling sessions: re-issue token/cookie after this age when session is accessed.
    updateAge: ROLE_REFRESH_WINDOW_SECONDS,
  },

  jwt: {
    maxAge: JWT_MAX_AGE_SECONDS,
  },

  // pages — error points to sign-in so error codes appear as /auth/sign-in?error=<CODE>
  pages: {
    signIn: "/auth/sign-in",
    signOut: "/auth/sign-out",
    error: "/auth/sign-in",
  },

  // useSecureCookies ensures NextAuth uses the NEXTAUTH_URL domain for
  // cookie domain, not the internal Host header. This is required when
  // running behind a reverse proxy (ngrok, Vercel, load balancers) where
  // the internal Host header differs from the public-facing URL.
  useSecureCookies: process.env.NODE_ENV === "production",

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Required so the adapter resolves user.id to the EXISTING user when a
      // Settings linking intent is present (same pattern as Azure AD). Without
      // it, a different Google email creates a new User, so the intent (tied
      // to the signed-in user) is not validated and linking can hijack the session.
      // signIn still enforces intent email match, mismatch deny, and Azure-specific
      // AuthLinkChallenge — Google fresh sign-ins merge by email only when allowed below.
      allowDangerousEmailAccountLinking: true,
    }),

    // Microsoft Entra ID (organizations only). Uses azure-ad provider; callback id is "azure-ad".
    AzureADProvider({
      clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET ?? "",
      tenantId: getEntraTenantId(),
      // allowDangerousEmailAccountLinking is required for the adapter to correctly
      // upsert users by email. Without it, the adapter returns the existing user id
      // making it impossible to detect conflicts by comparing user ids in signIn.
      // We do NOT auto-link: conflict detection in callbacks.signIn intercepts
      // cases where the existing user has a different provider and routes them
      // through the verified magic-link linking flow before the adapter links anything.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: { scope: "openid profile email" },
      },
      profile(profile) {
        const normalizedEmail = normalizeMicrosoftEmail(profile);
        return {
          id: profile.sub,
          name: profile.name ?? normalizedEmail ?? "Microsoft user",
          email: normalizedEmail,
          image: null,
        } as import("next-auth").User;
      },
    }),

    EmailProvider({
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        await sendMagicLink({
          email: identifier,
          url,
          from: provider.from as string,
        });
      },
    }),
  ],

  callbacks: {
    // Run before jwt callback so the new session exists when we attach sessionToken (avoids sign-out loop).
    async signIn({ user, account }) {
      if (!user?.id) return false;

      // ── 1. isPlatformBlocked — FIRST, applies to ALL providers ───────────────
      // A blocked user must never complete sign-in regardless of provider.
      const blockedCheck = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isPlatformBlocked: true },
      });
      if (blockedCheck?.isPlatformBlocked) return false;

      // ── 2. Microsoft (azure-ad): email validation + conflict detection ────────
      //
      // HOW THIS WORKS WITH allowDangerousEmailAccountLinking: true:
      // The adapter upserts by email before signIn runs. If a User with this email
      // already exists, user.id IS that existing user's id. The adapter then links
      // the azure-ad Account to that user.
      //
      // We need to detect the conflict BEFORE the adapter creates the Account row.
      // The adapter creates the Account row AFTER signIn returns true. So if we
      // return false here, the Account row is never created — the link never happens.
      //
      // Conflict = existing user already has a non-azure-ad account (email/google)
      // but does NOT yet have azure-ad linked. We intercept this and route through
      // the verified magic-link flow instead of allowing silent auto-linking.
      if (account?.provider === "azure-ad") {

        // 2a. Require a valid normalized email.
        const emailCandidate = user.email;
        const isValidEmail =
          typeof emailCandidate === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate);
        if (!isValidEmail) return false;

        const normalizedEmail = (emailCandidate as string).trim().toLowerCase();

        const settingsLink = await validateSettingsAccountLinkIntent({
          provider: "azure-ad",
          normalizedIncomingEmail: normalizedEmail,
          resolvedUserId: user.id,
        });
        if (settingsLink === "deny") return false;
        const skipMicrosoftConflict = settingsLink === "allow_skip_conflict";

        // 2b. Conflict detection (skip when Settings link intent validated — same email).
        if (!skipMicrosoftConflict) {
        const existingAccounts = await prisma.account.findMany({
          where: { userId: user.id },
          select: { provider: true, providerAccountId: true },
        });

        const hasAzureAd = existingAccounts.some((a) => a.provider === "azure-ad");
        const hasOtherProvider = existingAccounts.some(
          (a) => a.provider !== "azure-ad"
        );

        // Case A: azure-ad already linked to this user → normal sign-in, no conflict.
        if (hasAzureAd) {
          // Fall through to session creation below.
        }
        // Case B: user has other providers (email/google) but NOT azure-ad yet
        // → this is a conflict that requires verified linking.
        else if (hasOtherProvider) {
          // Clear stale Settings email_mismatch markers so redirect callback does not
          // send this AuthLinkChallenge flow to the account page instead of link-account.
          await prisma.accountLinkIntent.updateMany({
            where: {
              userId: user.id,
              targetProvider: "azure-ad",
              errorCode: "email_mismatch",
            },
            data: { errorCode: null },
          });
          // Safety check: ensure this specific Microsoft providerAccountId is not
          // already linked to a completely different user — fail closed if so.
          const accountOwner = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: "azure-ad",
                providerAccountId: account.providerAccountId,
              },
            },
            select: { userId: true },
          });
          if (accountOwner && accountOwner.userId !== user.id) {
            // This Microsoft identity belongs to someone else — deny silently.
            return false;
          }

          // Create the verified link challenge.
          const rawToken = randomBytes(32).toString("base64url");
          const tokenHash = createHash("sha256").update(rawToken).digest("hex");
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

          const challenge = await prisma.authLinkChallenge.create({
            data: {
              userId: user.id,
              email: normalizedEmail,
              targetProvider: "azure-ad",
              targetProviderAccountId: account.providerAccountId,
              tokenHash,
              expiresAt,
              // Stored briefly so /api/link/pending can issue the browser cookie.
              // Cleared immediately after the cookie is issued. Never logged.
              pendingRawToken: rawToken,
            },
          });

          await prisma.auditLog.create({
            data: {
              actorUserId: user.id,
              actorContext: "TENANT",
              tenantId: null,
              action: "auth.link.challenge.created",
              targetType: "AuthLinkChallenge",
              targetId: challenge.id,
              metadata: { targetProvider: "azure-ad", email: normalizedEmail },
            },
          });

          // Return false — NextAuth redirects to pages.error = "/auth/sign-in"
          // as ?error=AccessDenied. The sign-in page detects this and redirects
          // to /api/link/pending, which issues the cookie and redirects to
          // /auth/link-account?challenge=<token>.
          // Because we return false here, the adapter does NOT create the
          // azure-ad Account row — the link does not happen automatically.
          return false;
        }
        // Case C: brand new user (no existing accounts at all) → normal sign-in.
        // Fall through to session creation below.
        }
      }

      // ── 2c. Google: settings link intent validation + conflict posture ───────
      if (account?.provider === "google") {
        const raw = user.email;
        const normalizedGoogleEmail =
          typeof raw === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
            ? raw.trim().toLowerCase()
            : "";

        const googleLink = await validateSettingsAccountLinkIntent({
          provider: "google",
          normalizedIncomingEmail: normalizedGoogleEmail,
          resolvedUserId: user.id,
        });

        if (googleLink === "deny") return false;

        const skipGoogleConflict = googleLink === "allow_skip_conflict";

        if (!skipGoogleConflict) {
          // No Settings intent: fresh Google sign-in. With
          // allowDangerousEmailAccountLinking, the adapter already merged by
          // email — no OAuthAccountNotLinked. Unlike Azure AD, we do not use
          // AuthLinkChallenge for Google; normal sign-in proceeds.
        }
      }

      // ── 3. Email provider: finalize account linking if a valid pending
      //       challenge exists for this user ─────────────────────────────────────
      if (account?.provider === "email") {
        const now = new Date();
        const pending = await prisma.authLinkChallenge.findFirst({
          where: {
            // SECURITY: must belong to THIS exact user — prevents cross-user linking.
            userId: user.id,
            consumedAt: null,
            expiresAt: { gt: now },
            // Only finalize challenges that actually reached the browser.
            // cookieIssuedAt is set by /api/link/pending when it issues the cookie.
            cookieIssuedAt: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            targetProvider: true,
            targetProviderAccountId: true,
          },
        });

        if (pending) {
          try {
            // SECURITY: verify the Microsoft account is not already linked to a
            // different user before completing the link.
            const existingOwner = await prisma.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider: pending.targetProvider,
                  providerAccountId: pending.targetProviderAccountId,
                },
              },
              select: { userId: true },
            });

            if (existingOwner && existingOwner.userId !== user.id) {
              await prisma.auditLog.create({
                data: {
                  actorUserId: user.id,
                  actorContext: "TENANT",
                  tenantId: null,
                  action: "auth.link.failed",
                  targetType: "AuthLinkChallenge",
                  targetId: pending.id,
                  metadata: {
                    reason: "provider_account_owned_by_different_user",
                    targetProvider: pending.targetProvider,
                  },
                },
              });
              // Allow magic link sign-in but skip linking — do not reveal ownership.
              return true;
            }

            await prisma.$transaction([
              prisma.account.upsert({
                where: {
                  provider_providerAccountId: {
                    provider: pending.targetProvider,
                    providerAccountId: pending.targetProviderAccountId,
                  },
                },
                update: { userId: user.id },
                create: {
                  userId: user.id,
                  type: "oauth",
                  provider: pending.targetProvider,
                  providerAccountId: pending.targetProviderAccountId,
                },
              }),
              prisma.authLinkChallenge.update({
                where: { id: pending.id },
                data: { consumedAt: now },
              }),
            ]);

            await prisma.auditLog.create({
              data: {
                actorUserId: user.id,
                actorContext: "TENANT",
                tenantId: null,
                action: "auth.link.completed",
                targetType: "User",
                targetId: user.id,
                metadata: { linkedProvider: pending.targetProvider },
              },
            });
          } catch {
            await prisma.auditLog.create({
              data: {
                actorUserId: user.id,
                actorContext: "TENANT",
                tenantId: null,
                action: "auth.link.failed",
                targetType: "AuthLinkChallenge",
                targetId: pending.id,
                metadata: {
                  reason: "finalize_error",
                  targetProvider: pending.targetProvider,
                },
              },
            });
          }
        }
      }

      // ── 4. Wait for adapter to persist user (first OAuth sign-in race) ────────
      // Do not remove — handles a known NextAuth v4 race on first OAuth sign-in.
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
        return true;
      }

      // ── 5. Bootstrap platform owner / admin (idempotent) ─────────────────────
      await runUserBootstraps({ userId: user.id, email: user.email });

      // ── 6. MFA gating + DB session row creation ───────────────────────────────
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
      // A7: Persist iat for step-up (recent auth window) on transfer primary ownership.
      if (token.iat == null) {
        token.iat = Math.floor(Date.now() / 1000);
      }
      // L1: Store sessionToken in JWT for inactivity check and 2FA (set on sign-in).
      // Only attach non-revoked sessions so we never bind a revoked session (avoids sign-out loop).
      if (user?.id && (trigger === "signIn" || !token.sessionToken)) {
        const [security, mfaEnforced] = await Promise.all([
          prisma.userSecurity.findUnique({
            where: { userId: user.id },
            select: { totpEnabled: true },
          }),
          isMfaEnforcedForUser(user.id),
        ]);
        const needsMfa =
          security?.totpEnabled ||
          (mfaEnforced && !security?.totpEnabled);
        const sessionRow = needsMfa
          ? await prisma.session.findFirst({
              where: { userId: user.id, revokedAt: null, authLevel: "PENDING_MFA" },
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
        // L1: mfaVerified and totpEnabled — read from DB every time. Use the current session (sessionToken)
        // so 2FA verification persists for the life of the session (no expiration).
        if (token.sub) {
          const [sessionRow, security, mfaEnforced, userRecord] = await Promise.all([
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
            sessionRow && "revokedAt" in sessionRow && sessionRow.revokedAt != null;
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

  events: {
    async createUser({ user }) {
      // Bootstraps on user creation (idempotent)
      await Promise.all([
        runUserBootstraps({ userId: user.id, email: user.email }),
        prisma.user.update({
          where: { id: user.id },
          data: { appearance: "DARK" },
        }),
      ]);

      // Optional: assign PlatformAdmin based on env allowlist (your existing logic)
      const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
      const userEmail = (user.email ?? "").trim().toLowerCase();

      if (!bootstrapEmail || !userEmail) return;
      if (userEmail !== bootstrapEmail) return;

      const platformAdmin = await prisma.vendorRole.findUnique({
        where: { name: "PlatformAdmin" },
        select: { id: true },
      });

      if (!platformAdmin) return;

      await prisma.vendorUserRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: platformAdmin.id } },
        update: {},
        create: { userId: user.id, roleId: platformAdmin.id },
      });
    },

    // events.signIn: no runUserBootstraps here — already in callbacks.signIn (avoids double execution).
    async signIn({ user }) {
      if (!user?.id) return;
      // Reserved for future non-bootstrap sign-in events (e.g. audit logging).
    },
  },
};
