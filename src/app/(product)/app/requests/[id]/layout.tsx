import type { ReactNode } from "react";

export default function RequestDetailLayout({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 overflow-y-auto">{children}</div>;
}
