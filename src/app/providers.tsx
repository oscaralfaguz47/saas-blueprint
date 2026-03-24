"use client";

import { ToastProvider } from "@/components/ui/toast";

/** App providers. `SessionProvider` lives in `SessionProviderShell` in root `layout.tsx`. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
