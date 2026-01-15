import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";
import type { RoleKey } from "@/server/security/authorization";

export const authOptions: NextAuthOptions = {
  debug: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },

  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],

  // Si quieres usar tu /signin custom:
  pages: {
    signIn: "/signin",
    error: "/signin",
  },

callbacks: {
  async session({ session, user }) {
    if (session.user) {
      session.user.id = user.id;

      const role = (user as { role?: RoleKey }).role ?? "MEMBER";
      session.user.role = role;
    }

    return session;
  },
  },
};
