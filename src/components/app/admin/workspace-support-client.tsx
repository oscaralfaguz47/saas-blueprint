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
  lastMessageAt: string;
  createdAt: string;
};

export function WorkspaceSupportClient({ tenantId }: { tenantId: string }) {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/admin/support/tickets?tenantId=${encodeURIComponent(tenantId)}&limit=50`
      );
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
  }, [apiFetch, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="md" />
        <p className="text-sm text-(--text-muted)">Loading support tickets…</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-(--color-danger)">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No support tickets"
        description="This workspace has no support tickets yet."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead className="w-[120px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium text-(--text-primary)">{t.subject}</TableCell>
            <TableCell>{t.status}</TableCell>
            <TableCell>{t.priority}</TableCell>
            <TableCell className="text-(--text-muted)">
              {new Date(t.lastMessageAt).toLocaleString()}
            </TableCell>
            <TableCell>
              <Link
                href={`/admin/support?ticketId=${encodeURIComponent(t.id)}`}
                className="text-sm font-medium text-(--color-primary) hover:underline"
              >
                Open
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
