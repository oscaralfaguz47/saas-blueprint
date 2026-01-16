import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db";
import type { RoleKey } from "@/types/next-auth";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

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
      // En el primer login, NextAuth pasa "user"
      if (user) {
        token.role = user.role ?? "MEMBER";
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as RoleKey) ?? "MEMBER";
      }
      return session;
    },
  },
};
