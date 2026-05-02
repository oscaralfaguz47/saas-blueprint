"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FinanceStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useTenantPermissions } from "@/components/app/tenant-permissions-context";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  ALL_FINANCE_STATUSES_QUERY,
  financeStatusBadgeVariant,
  financeStatusLabel,
} from "@/lib/finance-queue-labels";
import { QueueRowActions } from "./queue-row-actions";
import { ReassignModal } from "./reassign-modal";
import type { FinanceQueueRecord } from "./finance-queue-types";

export type StatusFilterValue = "active" | "all" | FinanceStatus;

function formatMoney(amount: unknown, currencyCode: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (Number.isNaN(n)) return "—";
  const cur = currencyCode?.trim() || "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function buildQueueUrl(params: { limit: number; cursor?: string; statusFilter: StatusFilterValue }) {
  const q = new URLSearchParams({ limit: String(params.limit) });
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.statusFilter === "all") {
    q.set("status", ALL_FINANCE_STATUSES_QUERY);
  } else if (params.statusFilter !== "active") {
    q.set("status", params.statusFilter);
  }
  return `/api/finance/queue?${q}`;
}

export function FinanceQueueClient() {
  const apiFetch = useApiFetch();
  const { has } = useTenantPermissions();
  const canReassign = has("tenant.financial_config.manage");

  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("active");
  const [items, setItems] = useState<FinanceQueueRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryRecord, setSummaryRecord] = useState<FinanceQueueRecord | null>(null);
  const [reassignRecord, setReassignRecord] = useState<FinanceQueueRecord | null>(null);

  const fetchPage = useCallback(
    async (opts: { cursor: string | null; append: boolean }) => {
      const url = buildQueueUrl({ limit: 25, cursor: opts.cursor ?? undefined, statusFilter });
      const res = await apiFetch(url, { showToastOnError: false });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { items?: FinanceQueueRecord[]; nextCursor?: string | null };
        error?: { message?: string; code?: string };
      };
      if (!res.ok) {
        throw new Error(getApiErrorMessage(res, json));
      }
      const page = json.data?.items ?? [];
      const nc = json.data?.nextCursor ?? null;
      if (opts.append) {
        setItems((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const r of page) {
            if (!seen.has(r.id)) merged.push(r);
          }
          return merged;
        });
      } else {
        setItems(page);
      }
      setNextCursor(nc);
    },
    [apiFetch, statusFilter]
  );

  const refetchFirst = useCallback(async () => {
    setError(null);
    await fetchPage({ cursor: null, append: false });
  }, [fetchPage]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNextCursor(null);
    void fetchPage({ cursor: null, append: false })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load your queue. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const applyPatch = useCallback((id: string, patch: Partial<FinanceQueueRecord>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const rollbackRow = useCallback((id: string, snapshot: FinanceQueueRecord) => {
    setItems((prev) => prev.map((r) => (r.id === id ? snapshot : r)));
  }, []);

  const removeRow = useCallback((id: string) => {
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const restoreRows = useCallback((snapshot: FinanceQueueRecord[]) => {
    setItems(snapshot);
  }, []);

  const getItemsSnapshot = useCallback(() => items.map((r) => ({ ...r })), [items]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage({ cursor: nextCursor, append: true });
    } catch {
      setError("Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="queue-status-filter" className="block text-xs font-medium text-(--text-muted)">
            Status
          </label>
          <select
            id="queue-status-filter"
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "active" || v === "all") setStatusFilter(v);
              else setStatusFilter(v as FinanceStatus);
            }}
            className="mt-1 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary)"
          >
            <option value="active">Active assignments</option>
            <option value="all">All statuses</option>
            {Object.values(FinanceStatus).map((s) => (
              <option key={s} value={s}>
                {financeStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-8 text-center">
          <p className="text-sm text-(--text-secondary)">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              void fetchPage({ cursor: null, append: false })
                .catch((e: unknown) =>
                  setError(e instanceof Error ? e.message : "Could not load your queue. Try again.")
                )
                .finally(() => setLoading(false));
            }}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-12 text-center">
          <p className="text-sm font-medium text-(--text-primary)">You have no assignments</p>
          <p className="mt-1 text-xs text-(--text-muted)">
            When records are assigned to you for finance processing, they appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-(--border-subtle) bg-(--bg-surface-elev)">
                <tr>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Title</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Type</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Amount</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Department</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Priority</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Status</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-(--text-muted)">Assigned</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-(--text-muted)">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border-subtle)">
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-(--bg-surface-hover)"
                    onClick={() => setSummaryRecord(r)}
                  >
                    <td className="px-3 py-2 font-medium text-(--text-primary)">
                      <span className="line-clamp-2">{r.title || "Untitled"}</span>
                      {r.recordKey ? (
                        <span className="mt-0.5 block text-xs font-normal text-(--text-muted)">
                          {r.recordKey}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-(--text-secondary)">{r.type}</td>
                    <td className="px-3 py-2 text-(--text-secondary)">
                      {formatMoney(r.requestedAmount, r.currencyCode)}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2 text-(--text-muted)">
                      {r.departmentId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-(--text-secondary)">{r.priority}</td>
                    <td className="px-3 py-2">
                      <Badge variant={financeStatusBadgeVariant(r.financeStatus)}>
                        {financeStatusLabel(r.financeStatus)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-(--text-muted)">
                      {formatDate(r.financeAssignedAt)}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <QueueRowActions
                        record={r}
                        canReassign={canReassign}
                        apiFetch={apiFetch}
                        applyPatch={applyPatch}
                        rollbackRow={rollbackRow}
                        removeRow={removeRow}
                        restoreRows={restoreRows}
                        getItemsSnapshot={getItemsSnapshot}
                        onRefetch={refetchFirst}
                        onOpenReassign={setReassignRecord}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-hover) disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={summaryRecord !== null}
        onClose={() => setSummaryRecord(null)}
        title={summaryRecord?.title || "Record"}
        contentClassName="max-w-lg"
        footer={
          summaryRecord ? (
            <Link
              href={`/app/requests/${summaryRecord.id}`}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              Open request
            </Link>
          ) : null
        }
      >
        {summaryRecord ? (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-(--text-muted)">Record key</dt>
              <dd className="text-(--text-primary)">{summaryRecord.recordKey ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Type</dt>
              <dd className="text-(--text-primary)">{summaryRecord.type}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Workflow status</dt>
              <dd className="text-(--text-primary)">{summaryRecord.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Finance status</dt>
              <dd>
                <Badge variant={financeStatusBadgeVariant(summaryRecord.financeStatus)}>
                  {financeStatusLabel(summaryRecord.financeStatus)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Amount</dt>
              <dd className="text-(--text-primary)">
                {formatMoney(summaryRecord.requestedAmount, summaryRecord.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Priority</dt>
              <dd className="text-(--text-primary)">{summaryRecord.priority}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Approval</dt>
              <dd className="text-(--text-primary)">{summaryRecord.approvalStatus}</dd>
            </div>
            <div>
              <dt className="text-xs text-(--text-muted)">Assigned at</dt>
              <dd className="text-(--text-primary)">{formatDate(summaryRecord.financeAssignedAt)}</dd>
            </div>
          </dl>
        ) : null}
      </Dialog>

      {reassignRecord ? (
        <ReassignModal
          open={reassignRecord !== null}
          onClose={() => setReassignRecord(null)}
          recordId={reassignRecord.id}
          recordTitle={reassignRecord.title || reassignRecord.recordKey || reassignRecord.id}
          apiFetch={apiFetch}
          onSuccess={refetchFirst}
        />
      ) : null}
    </div>
  );
}
