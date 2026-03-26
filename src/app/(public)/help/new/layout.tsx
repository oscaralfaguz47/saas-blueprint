import type { ReactNode } from "react";

/**
 * Override the parent help/layout.tsx for the /help/new route only.
 * This removes the left rail sidebar and lets the page render
 * full-width with its own internal structure.
 *
 * (The rail is actually omitted via the `(browse)` route group; this layout
 * documents intent and avoids pulling browse-only UI into /help/new.)
 */
export default function HelpNewLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
