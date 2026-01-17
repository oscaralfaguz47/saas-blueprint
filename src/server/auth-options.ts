import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";
import type { RoleKey } from "@/types/next-auth";

// ---- Tunables (performance + security) ----
// Short-lived JWT (minutes)
const JWT_MAX_AGE_SECONDS = 480 * 60;

// Rolling refresh window (refresh role at most every x minutes)
const ROLE_REFRESH_WINDOW_SECONDS = 15 * 60;

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
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],

  pages: {
    signIn: "/signin",
  },

  callbacks: {
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);

      // First login: NextAuth passes "user"
      if (user) {
        // Persist user id in token (token.sub is standard)
        token.sub = user.id;

        // Keep role in token
        token.role = user.role ?? "MEMBER";

        // Track when role was last refreshed from DB
        token.roleRefreshedAt = now;

        return token;
      }

      // No user on subsequent calls: refresh role occasionally (not every request)
      if (!token.sub) return token;

      const last =
        typeof token.roleRefreshedAt === "number" ? token.roleRefreshedAt : 0;

      const shouldRefresh = now - last >= ROLE_REFRESH_WINDOW_SECONDS;
      if (!shouldRefresh) return token;

      // Lightweight DB call to get the latest role
      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { role: true },
      });

      token.role = (dbUser?.role ?? "MEMBER") as RoleKey;
      token.roleRefreshedAt = now;

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // Ensure session has id and role
        session.user.id = token.sub ?? session.user.id;
        session.user.role = (token.role as RoleKey) ?? "MEMBER";
      }
      return session;
    },
  },
};
