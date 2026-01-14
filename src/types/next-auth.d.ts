import type { DefaultSession } from "next-auth";
import type { RoleKey } from "@prisma/client";

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
