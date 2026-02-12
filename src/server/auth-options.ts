import "server-only";

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { Resend } from "resend";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";

import { ensureBootstrapPlatformOwner } from "@/server/services/platform-bootstrap";

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
    async session({ session, token }) {
      // Keep session callback pure: no DB writes / bootstraps here.
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // Bootstraps on user creation (idempotent)
      await runUserBootstraps({ userId: user.id, email: user.email });

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

    async signIn({ user }) {
      if (!user?.id) return;
      await runUserBootstraps({ userId: user.id, email: user.email });
    },
  },
};
