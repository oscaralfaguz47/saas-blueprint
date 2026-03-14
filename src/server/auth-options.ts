import "server-only";

import { randomBytes } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
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

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true, // Keep only if you truly need it
    }),

    EmailProvider({
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        // Send magic link
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

  pages: {
    signIn: "/auth/sign-in",
    signOut: "/auth/sign-out",
    error: "/auth/error",
  },

  callbacks: {
    // Run before jwt callback so the new session exists when we attach sessionToken (avoids sign-out loop).
    async signIn({ user }) {
      if (!user?.id) return false;

      // Adapter may not have persisted the user yet (e.g. first OAuth sign-in). Wait for user to exist to avoid Session_userId_fkey.
      let userExists: { id: string } | null = null;
      for (let i = 0; i < 3; i++) {
        userExists = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
        if (userExists) break;
        if (i < 2) await new Promise((r) => setTimeout(r, 100));
      }
      if (!userExists) {
        return true; // allow sign-in; session created on next request when jwt runs with !token.sessionToken
      }

      await runUserBootstraps({ userId: user.id, email: user.email });

      const [security, mfaEnforced] = await Promise.all([
        prisma.userSecurity.findUnique({
          where: { userId: user.id },
          select: { totpEnabled: true },
        }),
        isMfaEnforcedForUser(user.id),
      ]);

      const now = new Date();
      const sessionToken = randomBytes(32).toString("base64url");

      // E6: If 2FA is enforced by any workspace but not yet set up, create PENDING_MFA so user is sent to setup.
      const needsMfaChallenge =
        security?.totpEnabled ||
        (mfaEnforced && !security?.totpEnabled);

      // Create a new session; do not revoke existing sessions so the user can stay signed in on multiple devices.
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
      }
      if (!needsMfaChallenge) {
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

    // Session create/revoke moved to callbacks.signIn so it runs before jwt callback.
    async signIn({ user }) {
      if (!user?.id) return;
      await runUserBootstraps({ userId: user.id, email: user.email });
    },
  },
};
