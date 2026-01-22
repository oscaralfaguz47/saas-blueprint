import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { Resend } from "resend";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";
import type { RoleKey } from "@/types/next-auth";

import { ensureDefaultTenantForUser } from "@/server/tenancy-bootstrap";
import { ensureBootstrapPlatformOwner } from "@/server/services/platform-bootstrap";

// ---- Tunables (performance + security) ----
// JWT max age (seconds). 8 hours.
const JWT_MAX_AGE_SECONDS = 8 * 60 * 60;

// Rolling refresh window (refresh role at most every x minutes)
const ROLE_REFRESH_WINDOW_SECONDS = 15 * 60;

const resend = new Resend(process.env.RESEND_API_KEY!);

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
      allowDangerousEmailAccountLinking: true,
    }),
    EmailProvider({
      from: process.env.EMAIL_FROM,
      // NextAuth te da el URL del magic link firmado
      async sendVerificationRequest({ identifier, url, provider }) {
        await resend.emails.send({
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
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },

 callbacks: {
 async session({ session, token }) {
  if (session.user) {
    session.user.id = token.sub ?? session.user.id;

    await ensureDefaultTenantForUser({
      userId: session.user.id,
      userEmail: session.user.email,
    });

    await ensureBootstrapPlatformOwner({
      userId: session.user.id,
      email: session.user.email,
    });
  }

  return session;
},
},
  events: {
    async createUser({ user }) {
      const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
      const userEmail = (user.email ?? "").trim().toLowerCase();

      if (!bootstrapEmail || !userEmail) return;
      if (userEmail !== bootstrapEmail) return;

      // Ensure PlatformAdmin role exists (seed should do it, but defense-in-depth)
      const platformAdmin = await prisma.vendorRole.findUnique({
        where: { name: "PlatformAdmin" },
        select: { id: true },
      });

      if (!platformAdmin) return;

      // Assign role idempotently
      await prisma.vendorUserRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: platformAdmin.id } },
        update: {},
        create: { userId: user.id, roleId: platformAdmin.id },
      });
    },
  },

};
