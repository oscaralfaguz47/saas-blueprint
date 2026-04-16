import type { ReactNode } from "react";

import { ChatWidgetRoot } from "@/components/help/chat-widget-root";

export default function PublicGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ChatWidgetRoot hasTenant={true} />
    </>
  );
}
