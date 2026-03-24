"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";

type SessionRow = {
  id: string;
  userId: string | null;
  visitorEmail: string | null;
  isAuthenticated: boolean;
  messageCount: number;
  startedAt: string;
  endedAt: string | null;
};

type Summary = {
  totalSessions: number;
  authenticatedSessions: number;
  visitorSessions: number;
  totalMessages: number;
};

export function AdminChatHistoryClient({ summary }: { summary: Summary }) {
  const [items, setItems] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authFilter, setAuthFilter] = useState<"all" | "true" | "false">("all");
  const [q, setQ] = useState("");

  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (authFilter === "true") sp.set("isAuthenticated", "true");
      if (authFilter === "false") sp.set("isAuthenticated", "false");
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/admin/chat/sessions?${sp.toString()}`);
      if (!res.ok) {
        setError("Failed to load sessions.");
        setItems([]);
        return;
      }
      const j = (await res.json()) as {
        data?: { sessions?: SessionRow[]; total?: number };
      };
      setItems(j.data?.sessions ?? []);
      setTotal(j.data?.total ?? 0);
    } catch {
      setError("Failed to load sessions.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, authFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total sessions", value: summary.totalSessions },
          { label: "Authenticated", value: summary.authenticatedSessions },
          { label: "Visitor", value: summary.visitorSessions },
          { label: "Total messages", value: summary.totalMessages },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4"
          >
            <div className="text-sm text-(--text-muted)">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-(--text-primary)">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-sm">
          <span className="mr-2 text-(--text-muted)">Type</span>
          <select
            value={authFilter}
            onChange={(e) => {
              setPage(1);
              setAuthFilter(e.target.value as "all" | "true" | "false");
            }}
            className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="true">Authenticated</option>
            <option value="false">Visitor</option>
          </select>
        </label>
        <div className="flex flex-1 flex-col gap-1 sm:max-w-sm">
          <label htmlFor="chat-q" className="text-sm text-(--text-muted)">
            Search email / user id
          </label>
          <div className="flex gap-2">
            <input
              id="chat-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 rounded-md border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
              placeholder="Search…"
            />
            <button
              type="button"
              onClick={() => {
                setPage(1);
                void load();
              }}
              className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-(--color-danger)">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-(--border-subtle) bg-(--bg-surface-elev)">
              <tr>
                <th className="px-3 py-2 font-medium">Session</th>
                <th className="px-3 py-2 font-medium">User / Email</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Messages</th>
                <th className="px-3 py-2 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const duration =
                  s.endedAt && s.startedAt
                    ? `${Math.round(
                        (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000
                      )} min`
                    : "—";
                return (
                  <tr key={s.id} className="border-b border-(--border-subtle) last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/admin/chat/${s.id}`}
                        className="text-(--color-primary) hover:underline"
                      >
                        {s.id.slice(0, 12)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {s.isAuthenticated
                        ? s.userId
                          ? `${s.userId.slice(0, 8)}…`
                          : "—"
                        : s.visitorEmail ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {s.isAuthenticated ? "Authenticated" : "Visitor"}
                    </td>
                    <td className="px-3 py-2">{s.messageCount}</td>
                    <td className="px-3 py-2 text-(--text-muted)">
                      {new Date(s.startedAt).toLocaleString()}
                      <span className="ml-1 text-xs">({duration})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > limit ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-(--text-muted)">
            Page {page} — {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-(--border-subtle) px-3 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * limit >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-(--border-subtle) px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
