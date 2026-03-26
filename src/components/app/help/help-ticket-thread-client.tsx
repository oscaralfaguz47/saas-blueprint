"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CardContent, CardRoot } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
      toast.addToast("success", "Reply sent");
    } finally {
      setSending(false);
    }
  }, [apiFetch, reply, ticketId, toast]);

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

      <div className="space-y-4">
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
      </div>

      {closed ? null : (
        <div className="border-t border-(--border-subtle) pt-6">
          <label className="text-sm font-medium text-(--text-primary)">Reply</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            disabled={sending}
            rows={5}
            className="mt-2 w-full max-w-2xl rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm shadow-sm focus:border-(--color-primary-soft) focus:outline-none focus:ring-2 focus:ring-(--color-primary-soft)/25"
            placeholder="Write your reply…"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !reply.trim()}
            className="mt-3 inline-flex h-10 min-w-[8rem] items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? <Spinner size="sm" /> : null}
            Send reply
          </button>
        </div>
      )}
    </div>
  );
}
