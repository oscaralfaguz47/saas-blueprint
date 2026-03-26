"use client";

import type { CSSProperties, ReactNode } from "react";

const OPEN_CHAT_WIDGET_EVENT = "open-chat-widget";

export function dispatchOpenChatWidget(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_CHAT_WIDGET_EVENT));
}

type OpenChatWidgetTriggerProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** Button that opens the floating AI chat via a document event (handled in `ChatWidget`). */
export function OpenChatWidgetTrigger({ children, className, style }: OpenChatWidgetTriggerProps) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => dispatchOpenChatWidget()}
    >
      {children}
    </button>
  );
}
