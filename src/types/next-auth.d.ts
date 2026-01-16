import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

export type RoleKey = "ADMIN" | "MANAGER" | "MEMBER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleKey;
    } & DefaultSession["user"];
  }

  interface User {
    role: RoleKey;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: RoleKey;
  }
}
