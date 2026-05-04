"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { WebhookDeliveryStatus } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { formatRelativeTime } from "@/lib/notifications-format";
import { getApiErrorMessage } from "@/lib/api-client";
import { WEBHOOK_EVENT_LABELS } from "./event-labels";

type DeliveryRow = {
  id: string;
  eventName: string;
  eventId: string;
  payloadVersion: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastResponseStatus: number | null;
  lastResponseDurationMs: number | null;
  lastResponseBodyExcerpt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  succeededAt: string | null;
  finalFailedAt: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  endpoint: { id: string; name: string } | null;
};

/** nextAttemptAt is in the future — formatRelativeTime is past-only. */
function formatRetryIn(iso: string | null): string {
  if (iso == null) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = t - Date.now();
  if (diffMs <= 0) return "soon";
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "in under a minute";
  if (diffMs < hour) {
    const n = Math.ceil(diffMs / minute);
    return `in ${n} minute${n === 1 ? "" : "s"}`;
  }
  if (diffMs < day) {
    const n = Math.floor(diffMs / hour);
    return `in ${n} hour${n === 1 ? "" : "s"}`;
  }
  const n = Math.floor(diffMs / day);
  return `in ${n} day${n === 1 ? "" : "s"}`;
}

function relOrDash(iso: string | null): string {
  if (iso == null) return "—";
  const s = formatRelativeTime(iso);
  return s || "—";
}

function formatHttpResponse(row: DeliveryRow): string {
  if (row.lastResponseStatus == null && row.lastResponseDurationMs == null) return "—";
  const code = row.lastResponseStatus != null ? String(row.lastResponseStatus) : "—";
  const ms =
    row.lastResponseDurationMs != null ? `${row.lastResponseDurationMs}ms` : null;
  if (ms) return `${code} (${ms})`;
  return code;
}

function deliveryStatusBadge(status: WebhookDeliveryStatus) {
  switch (status) {
    case WebhookDeliveryStatus.SUCCEEDED:
      return <Badge variant="success">Succeeded</Badge>;
    case WebhookDeliveryStatus.FAILED_FINAL:
      return <Badge variant="destructive">Failed (final)</Badge>;
    case WebhookDeliveryStatus.FAILED_RETRY:
      return <Badge variant="warning">Failed (retry)</Badge>;
    case WebhookDeliveryStatus.IN_FLIGHT:
      return (
        <Badge
          variant="default"
          className="border-(--color-primary-soft) bg-(--color-primary-soft) text-(--color-primary)"
        >
          In flight
        </Badge>
      );
    case WebhookDeliveryStatus.CANCELED:
      return <Badge variant="secondary">Canceled</Badge>;
    case WebhookDeliveryStatus.PENDING:
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

const TRUNC = 100;

function truncate(s: string | null, len: number): string {
  if (s == null) return "";
  return s.length <= len ? s : `${s.slice(0, len)}…`;
}

export function DeliveriesModal({ open, onClose, endpoint }: Props) {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const buildUrl = useCallback(
    (cursor: string | null) => {
      if (!endpoint) return "";
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      if (statusFilter) params.set("status", statusFilter);
      return `/api/tenant/webhook-endpoints/${endpoint.id}/deliveries?${params.toString()}`;
    },
    [endpoint, statusFilter],
  );

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!endpoint) return;
      const res = await apiFetch(buildUrl(cursor), { showToastOnError: false });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { items?: DeliveryRow[]; nextCursor?: string | null };
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        setError(getApiErrorMessage(res, { error: data.error }));
        return;
      }
      setError(null);
      const rows = data.data?.items ?? [];
      const next = data.data?.nextCursor ?? null;
      if (append) {
        setItems((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...rows.filter((r) => !seen.has(r.id))];
        });
      } else {
        setItems(rows);
      }
      setNextCursor(next);
    },
    [apiFetch, buildUrl, endpoint],
  );

  useEffect(() => {
    if (!open || !endpoint) return;
    setExpandedId(null);
    setNextCursor(null);
    setItems([]);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchPage(null, false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, endpoint, statusFilter, fetchPage]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor, true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!endpoint) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Deliveries — ${endpoint.name}`}
      contentClassName="max-w-6xl w-full"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="wh-deliveries-status" className="text-sm font-medium text-(--text-primary)">
            Status
          </label>
          <select
            id="wh-deliveries-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={loading}
            className="h-10 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="IN_FLIGHT">In flight</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED_RETRY">Failed (retry)</option>
            <option value="FAILED_FINAL">Failed (final)</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>

        {error ? (
          <div className="rounded-lg border border-(--border-subtle) bg-(--color-danger-soft) px-4 py-3 text-sm">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void fetchPage(null, false)}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !error && items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-(--border-subtle) px-4 py-8 text-center text-sm text-(--text-muted)">
            No delivery attempts yet. Events appear after they are triggered.
          </p>
        ) : !error ? (
          <>
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-(--border-subtle)">
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-10 bg-(--bg-surface-elev) shadow-[inset_0_-1px_0_var(--border-subtle)]">
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableHead>Created</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead>Next retry</TableHead>
                    <TableHead>Done</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                      >
                        <TableCell className="whitespace-nowrap" title={row.createdAt}>
                          {relOrDash(row.createdAt)}
                        </TableCell>
                        <TableCell title={row.eventName}>
                          {(WEBHOOK_EVENT_LABELS as Record<string, string>)[row.eventName] ??
                            row.eventName}
                        </TableCell>
                        <TableCell>{deliveryStatusBadge(row.status)}</TableCell>
                        <TableCell>
                          {row.attemptCount} / {row.maxAttempts}
                        </TableCell>
                        <TableCell title={formatHttpResponse(row)}>{formatHttpResponse(row)}</TableCell>
                        <TableCell title={row.lastErrorMessage ?? undefined}>
                          {truncate(row.lastErrorMessage, TRUNC) || "—"}
                        </TableCell>
                        <TableCell>
                          {row.status === WebhookDeliveryStatus.FAILED_RETRY
                            ? formatRetryIn(row.nextAttemptAt)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-(--text-muted)">
                          {row.status === WebhookDeliveryStatus.SUCCEEDED
                            ? relOrDash(row.succeededAt)
                            : row.status === WebhookDeliveryStatus.FAILED_FINAL
                              ? relOrDash(row.finalFailedAt)
                              : "—"}
                        </TableCell>
                      </TableRow>
                      {expandedId === row.id ? (
                        <TableRow className="hover:bg-(--bg-surface-elev)">
                          <TableCell colSpan={8} className="bg-(--bg-surface-elev) text-xs">
                            <div className="space-y-2 py-2">
                              {row.lastResponseBodyExcerpt ? (
                                <div>
                                  <span className="font-medium text-(--text-primary)">Body excerpt</span>
                                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-(--text-secondary)">
                                    {row.lastResponseBodyExcerpt}
                                  </pre>
                                </div>
                              ) : null}
                              {row.lastErrorMessage ? (
                                <div>
                                  <span className="font-medium text-(--text-primary)">Error</span>
                                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-(--text-secondary)">
                                    {row.lastErrorMessage}
                                  </pre>
                                </div>
                              ) : null}
                              {!row.lastResponseBodyExcerpt && !row.lastErrorMessage ? (
                                <p className="text-(--text-muted)">No excerpt or error.</p>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </table>
            </div>
            {nextCursor ? (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Spinner size="sm" /> : null}
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
