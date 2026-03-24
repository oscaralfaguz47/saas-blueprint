"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiFetch } from "@/hooks/use-api-fetch";

type Row = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  ticketType: string;
  requesterEmail: string | null;
  lastMessageAt: string;
  createdAt: string;
  tenant: { id: string; name: string; slug: string } | null;
  requester: { id: string; name: string | null; email: string | null } | null;
  assignee: { id: string; name: string | null; email: string | null } | null;
};

export function SupportTicketsAdminClient() {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/support/tickets?limit=50");
      if (!res.ok) {
        setError("Failed to load tickets");
        return;
      }
      const json = (await res.json()) as { data: { items: Row[] } };
      setItems(json.data?.items ?? []);
    } catch {
      setError("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="md" />
        <p className="text-sm text-(--text-muted)">Loading tickets…</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-(--color-danger)">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState title="No tickets" description="There are no support tickets to display." />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Workspace</TableHead>
          <TableHead>Requester</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead>Last message</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="max-w-[240px] truncate font-medium">{t.subject}</TableCell>
            <TableCell className="text-(--text-muted) text-xs">
              {t.ticketType === "SALES_INQUIRY" ? "Sales" : "Support"}
            </TableCell>
            <TableCell>
              {t.tenant ? (
                <Link
                  className="text-(--color-primary) hover:underline"
                  href={`/admin/workspaces/${t.tenant.id}`}
                >
                  {t.tenant.name}
                </Link>
              ) : (
                <span className="text-(--text-muted)">—</span>
              )}
            </TableCell>
            <TableCell className="text-(--text-muted)">
              {t.requester?.email ?? t.requesterEmail ?? "—"}
            </TableCell>
            <TableCell>{t.status}</TableCell>
            <TableCell>{t.priority}</TableCell>
            <TableCell className="text-(--text-muted)">{t.assignee?.email ?? "—"}</TableCell>
            <TableCell className="text-(--text-muted)">
              {new Date(t.lastMessageAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
