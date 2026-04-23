"use client";

import { signOut } from "next-auth/react";

export function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() =>
        signOut({ callbackUrl: "/auth/sign-in", redirect: true })
      }
      className="text-sm font-medium text-(--text-secondary) hover:text-(--text-primary)"
    >
      Sign in with a different account
    </button>
  );
}
