"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { CardContent, CardRoot } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

type Msg = {
  id: string;
  bodyText: string;
  authorKind: string;
  createdAt: string;
  authorUserId: string | null;
};

type Ticket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
};

function authorLabel(kind: string): string {
  if (kind === "WORKSPACE_USER") return "You";
  if (kind === "PLATFORM_ADMIN") return "Relitrue Support";
  return "System";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "OPEN":
      return "border-blue-500/35 bg-blue-500/10 text-blue-800 dark:text-blue-200";
    case "IN_PROGRESS":
      return "border-amber-400/40 bg-amber-400/15 text-amber-900 dark:text-amber-100";
    case "WAITING_FOR_CUSTOMER":
      return "border-orange-500/35 bg-orange-500/12 text-orange-900 dark:text-orange-100";
    case "CLOSED":
      return "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-muted)";
    default:
      return "";
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "HIGH":
      return "border-red-500/35 bg-red-500/10 text-red-800 dark:text-red-200";
    case "MEDIUM":
      return "border-amber-400/40 bg-amber-400/15 text-amber-900 dark:text-amber-100";
    case "LOW":
      return "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-muted)";
    default:
      return "";
  }
}

export function HelpTicketThreadClient({ ticketId }: { ticketId: string }) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(`/api/app/help/tickets/${ticketId}`);
      if (!res.ok) {
        setTicket(null);
        setLoadError("Ticket could not be loaded.");
        return;
      }
      const json = (await res.json()) as {
        data: { ticket: Ticket; messages: Msg[] };
      };
      setTicket(json.data.ticket);
      setMessages(json.data.messages ?? []);
    } catch {
      setTicket(null);
      setLoadError("Ticket could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, ticketId]);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      void load();
    }
  }, [load]);

  useEffect(() => {
    const handleTicketRefresh = (e: Event) => {
      const detail = (e as CustomEvent<{ ticketId: string }>).detail;
      if (detail?.ticketId === ticketId) {
        void load();
      }
    };
    window.addEventListener("relitrue:ticket-refresh", handleTicketRefresh);
    return () => {
      window.removeEventListener("relitrue:ticket-refresh", handleTicketRefresh);
    };
  }, [load, ticketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    if (!reply.trim()) return;
    setSending(true);
    const messageText = reply.trim();
    try {
      const res = await apiFetch(`/api/app/help/tickets/${ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });
      if (!res.ok) {
        toast.addToast("error", "Could not send reply");
        return;
      }
      const json = (await res.json()) as { data?: { messageId?: string } };

      // Optimistically append the new message to local state
      // instead of re-fetching all messages from the server
      const newMsg: Msg = {
        id: json.data?.messageId ?? `temp-${Date.now()}`,
        bodyText: messageText,
        authorKind: "WORKSPACE_USER",
        authorUserId: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newMsg]);
      setReply("");
      setTimeout(() => replyTextareaRef.current?.focus(), 50);
      toast.addToast("success", "Reply sent");
    } finally {
      setSending(false);
    }
  }, [apiFetch, reply, ticketId, toast]);

  const handleReplyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sending && reply.trim() && reply.length <= 4000) {
          void send();
        }
      }
    },
    [sending, reply, send],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3 max-w-md rounded-lg" />
        <Skeleton className="h-6 w-48 rounded-lg" />
        <div className="mt-8 space-y-4">
          <Skeleton className="ml-auto h-24 w-[90%] max-w-lg rounded-xl" />
          <Skeleton className="h-24 w-[90%] max-w-lg rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError || !ticket) {
    return (
      <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-8 text-center">
        <p className="text-sm text-(--color-danger)">{loadError ?? "Ticket not found."}</p>
        <Link href="/app/help/inbox" className="mt-4 inline-block text-sm font-medium text-(--color-primary) hover:underline">
          Back to inbox
        </Link>
      </div>
    );
  }

  const closed = ticket.status === "CLOSED";

  return (
    <div className="space-y-8">
      <header className="border-b border-(--border-subtle) pb-6">
        <h1 className="text-2xl font-semibold text-(--text-primary)">{ticket.subject}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={statusBadgeClass(ticket.status)}>
            {ticket.status.replace(/_/g, " ")}
          </Badge>
          <Badge variant="secondary" className={priorityBadgeClass(ticket.priority)}>
            {ticket.priority}
          </Badge>
          <span className="text-sm text-(--text-muted)">
            Created {new Date(ticket.createdAt).toLocaleString()}
          </span>
        </div>
      </header>

      {closed ? (
        <div
          role="status"
          className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-3 text-sm text-(--text-secondary)"
        >
          This ticket is closed. Replies are disabled.
        </div>
      ) : null}

      <div
        className="space-y-4 pr-2"
        style={{
          maxHeight: "45vh",
          overflowY: "auto",
          scrollBehavior: "smooth",
        }}
      >
        {messages.map((m) => {
          const mine = m.authorKind === "WORKSPACE_USER";
          return (
            <div
              key={m.id}
              className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
            >
              <CardRoot
                className={`max-w-[min(100%,36rem)] ${
                  mine ? "border-(--color-primary-soft)/50 bg-[color-mix(in_srgb,var(--nav-active)_100%,transparent)]" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-baseline gap-2 text-xs text-(--text-muted)">
                    <span className="font-semibold text-(--text-primary)">{authorLabel(m.authorKind)}</span>
                    <span>·</span>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-(--text-primary)">{m.bodyText}</p>
                </CardContent>
              </CardRoot>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {closed ? null : (
        <div className="border-t border-(--border-subtle) pt-4">
          <div>
            <div className="flex items-end gap-3">
              <textarea
                ref={replyTextareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleReplyKeyDown}
                disabled={sending}
                rows={3}
                maxLength={4000}
                className="flex-1 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm shadow-sm focus:border-(--color-primary-soft) focus:outline-none focus:ring-2 focus:ring-(--color-primary-soft)/25 resize-none"
                placeholder="Write your reply…"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !reply.trim() || reply.length > 4000}
                style={{ backgroundColor: "var(--color-primary, #3b82f6)" }}
                className="mb-0.5 inline-flex h-10 w-28 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending..." : "Send reply"}
              </button>
            </div>
            <div
              className="mt-1 items-center justify-between"
              style={{ display: "flex", paddingRight: "7.5rem" }}
            >
              <p className="text-[11px] text-(--text-muted)">
                Press Enter to send · Shift+Enter for new line
              </p>
              {reply.length > 0 ? (
                <p
                  className={`text-[11px] ${
                    reply.length >= 3900
                      ? "text-(--color-danger)"
                      : reply.length > 3500
                        ? "text-(--color-warning)"
                        : "text-(--text-muted)"
                  }`}
                  aria-live="polite"
                >
                  {reply.length} / 4000
                </p>
              ) : (
                <p className="text-[11px] text-(--text-muted)">0 / 4000</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
