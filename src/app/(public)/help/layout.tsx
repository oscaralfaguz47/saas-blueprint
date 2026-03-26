import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * Pass-through shell for all /help/* routes. The browse experience (left rail)
 * lives under `(browse)/layout.tsx` so `/help/new` can render full-width without
 * the help sidebar.
 */
export default function PublicHelpLayout({ children }: { children: ReactNode }) {
  return children;
}
