"use client";

import type { ReactNode } from "react";

const OPEN_CHAT_WIDGET_EVENT = "open-chat-widget";

export function dispatchOpenChatWidget(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_CHAT_WIDGET_EVENT));
}

type OpenChatWidgetTriggerProps = {
  children: ReactNode;
  className?: string;
};

/** Button that opens the floating AI chat via a document event (handled in `ChatWidget`). */
export function OpenChatWidgetTrigger({ children, className }: OpenChatWidgetTriggerProps) {
  return (
    <button type="button" className={className} onClick={() => dispatchOpenChatWidget()}>
      {children}
    </button>
  );
}
