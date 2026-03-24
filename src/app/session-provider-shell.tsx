"use client";

import { SessionProvider } from "next-auth/react";

/** Wraps the app so `useSession` works for body-level UI (e.g. chat widget) outside nested layouts. */
export function SessionProviderShell({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
