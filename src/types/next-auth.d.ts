import NextAuth from "next-auth";

export type RoleKey = "ADMIN" | "MANAGER" | "MEMBER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleKey;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** A7: JWT iat (seconds) for step-up / recent-auth checks (e.g. transfer ownership). */
      iat?: number;
    };
  }

  interface User {
    role: RoleKey;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    email?: string;
    role?: RoleKey;
    roleRefreshedAt?: number;
    /** Issued-at (seconds); set in jwt callback for A7 step-up. */
    iat?: number;
  }
}
