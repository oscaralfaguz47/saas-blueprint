import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function RequestsLayout({ children }: { children: ReactNode }) {
  return <div className="h-full w-full">{children}</div>;
}
