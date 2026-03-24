"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconFileText } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiFetch } from "@/hooks/use-api-fetch";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  lastMessageAt: string;
  createdAt: string;
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

function statusBadgeVariant(status: string): "default" | "warning" | "secondary" | "success" {
  switch (status) {
    case "OPEN":
      return "default";
    case "IN_PROGRESS":
      return "warning";
    case "WAITING_FOR_CUSTOMER":
      return "warning";
    case "CLOSED":
      return "secondary";
    default:
      return "secondary";
  }
}

function statusClassName(status: string): string {
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

function priorityClassName(priority: string): string {
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

export function HelpInboxClient() {
  const apiFetch = useApiFetch();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/app/help/tickets");
      if (!res.ok) {
        setError("Could not load tickets.");
        return;
      }
      const json = (await res.json()) as { data: { tickets: Ticket[] } };
      setTickets(json.data?.tickets ?? []);
    } catch {
      setError("Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-6 text-center">
        <p className="text-sm text-(--color-danger)">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-primary) hover:bg-(--nav-hover)"
        >
          Retry
        </button>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No support tickets yet"
        description="When you contact support, your conversations will appear here."
        icon={<IconFileText size={40} className="opacity-50" />}
        action={{ label: "New request", href: "/app/help/new" }}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.id} className="hover:bg-(--nav-hover)/60">
              <TableCell>
                <Link
                  href={`/app/help/tickets/${t.id}`}
                  className="font-semibold text-(--color-primary) hover:underline"
                >
                  {t.subject}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(t.status)} className={statusClassName(t.status)}>
                  {t.status.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className={priorityClassName(t.priority)}>
                  {t.priority}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-sm text-(--text-muted)">
                {formatRelativeTime(t.lastMessageAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
