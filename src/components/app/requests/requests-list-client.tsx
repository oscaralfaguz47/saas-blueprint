"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  IconPlus,
  IconSearch,
  IconFileText,
  IconAlertCircle,
  IconFilter,
} from "@/components/ui/icons";
import {
  formatAmount,
  formatDate,
  RECORD_TYPE_LABELS,
  RECORD_STATUS_BADGE,
  RECORD_STATUS_LABELS,
} from "@/lib/record-utils";
import type { RecordListItem } from "@/types/records";
import { useCreateRequestModal } from "./create-request-modal-context";

const TABS = [
  { value: "my", label: "My Requests" },
  { value: "inbox", label: "Inbox" },
  { value: "mentioned", label: "Mentioned" },
  { value: "shared", label: "Shared with me" },
] as const;

type Tab = (typeof TABS)[number]["value"] | "all";

type Filters = {
  status: string;
  type: string;
  amountMin: string;
  amountMax: string;
  currency: string;
};

const EMPTY_FILTERS: Filters = {
  status: "",
  type: "",
  amountMin: "",
  amountMax: "",
  currency: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Any type" },
  { value: "SCOPE_CHANGE", label: "Scope Change" },
  { value: "DECISION", label: "Decision" },
  { value: "BUDGET", label: "Budget" },
];

type Props = {
  canCreate: boolean;
  canReadAll: boolean;
};

function normalizeListItem(raw: RecordListItem & { amount?: unknown }): RecordListItem {
  let amount: number | null = null;
  const a = raw.amount as unknown;
  if (a != null && a !== "") {
    const n = typeof a === "number" ? a : Number(a);
    amount = Number.isFinite(n) ? n : null;
  }
  return {
    ...raw,
    amount,
  };
}

export function RequestsListClient({ canCreate, canReadAll }: Props) {
  const { openCreateRequestModal } = useCreateRequestModal();
  const router = useRouter();
  const apiFetch = useApiFetch();

  const [tab, setTab] = useState<Tab>("my");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [records, setRecords] = useState<RecordListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const allTabs = canReadAll ? [...TABS, { value: "all" as const, label: "All" }] : TABS;

  const fetchRecords = useCallback(
    async (activeTab: Tab, searchTerm: string, cursor: string | null, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!append) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const f = filtersRef.current;
        const params = new URLSearchParams({ tab: activeTab, limit: "25" });
        if (searchTerm) params.set("search", searchTerm);
        if (cursor) params.set("cursor", cursor);
        if (f.status) params.set("status", f.status);
        if (f.type) params.set("type", f.type);
        if (f.amountMin) params.set("amountMin", f.amountMin);
        if (f.amountMax) params.set("amountMax", f.amountMax);
        if (f.currency) params.set("currency", f.currency);

        const res = await apiFetch(`/api/records?${params}`, {
          signal: controller.signal,
          showToastOnError: false,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError("Failed to load requests.");
          return;
        }
        const json = (await res.json()) as {
          data: {
            records: (RecordListItem & { amount?: unknown })[];
            nextCursor: string | null;
            hasMore: boolean;
          };
        };
        if (controller.signal.aborted) return;
        const newRecords = json.data.records.map(normalizeListItem);
        setRecords((prev) => (append ? [...prev, ...newRecords] : newRecords));
        setNextCursor(json.data.nextCursor);
        setHasMore(json.data.hasMore);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Failed to load requests.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    setRecords([]);
    setNextCursor(null);
    void fetchRecords(tab, search, null, false);
  }, [tab, search, filters, fetchRecords]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleTabChange(value: string) {
    setTab(value as Tab);
    setSearchInput("");
    setSearch("");
  }

  function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    void fetchRecords(tab, search, nextCursor, true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-(--text-primary)">Requests</h1>
        {canCreate && (
          <button
            type="button"
            onClick={() => openCreateRequestModal()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover)"
          >
            <IconPlus size={16} />
            New request
          </button>
        )}
      </div>

      <KpiStrip canReadAll={canReadAll} />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="space-y-4">
          <TabsList>
            {allTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm min-w-[200px] flex-1">
              <IconSearch
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)"
              />
              <Input
                type="search"
                placeholder="Search requests…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                showFilters || activeFilterCount > 0
                  ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                  : "border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-surface-hover)",
              ].join(" ")}
            >
              <IconFilter size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-primary) px-1 text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <FiltersPanel
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(EMPTY_FILTERS)}
            />
          )}

          {allTabs.map((t) => (
            <TabsContent
              key={t.value}
              value={t.value}
              className="-mt-0 rounded-none border-0 bg-transparent p-0 shadow-none"
            >
              <RecordsList
                records={records}
                loading={loading}
                loadingMore={loadingMore}
                error={error}
                hasMore={hasMore}
                onLoadMore={handleLoadMore}
                tab={t.value}
                canCreate={canCreate}
                onNavigate={(id) => router.push(`/app/requests/${id}`)}
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

function FiltersPanel({
  filters,
  onChange,
  onClear,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-(--text-primary)">Filters</p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-(--text-muted) transition-colors hover:text-(--text-primary)"
        >
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-(--text-muted)">Status</label>
          <select
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
            className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-focus-ring) focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "any-status"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-(--text-muted)">Type</label>
          <select
            value={filters.type}
            onChange={(e) => set("type", e.target.value)}
            className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-focus-ring) focus:outline-none"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value || "any-type"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-(--text-muted)">Min amount</label>
          <Input
            type="number"
            min="0"
            value={filters.amountMin}
            onChange={(e) => set("amountMin", e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-(--text-muted)">Max amount</label>
          <Input
            type="number"
            min="0"
            value={filters.amountMax}
            onChange={(e) => set("amountMax", e.target.value)}
            placeholder="∞"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-(--text-muted)">Currency</label>
          <Input
            value={filters.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            placeholder="USD"
            maxLength={3}
          />
        </div>
      </div>
    </div>
  );
}

function KpiStrip({ canReadAll }: { canReadAll: boolean }) {
  const apiFetch = useApiFetch();
  const [counts, setCounts] = useState<{
    open: number;
    pending: number;
    closed: number;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const tabForScope = canReadAll ? "all" : "my";
    void Promise.all([
      apiFetch(`/api/records?tab=${tabForScope}&status=OPEN&limit=1`, {
        showToastOnError: false,
        signal: controller.signal,
      }),
      apiFetch("/api/records?tab=inbox&limit=1", {
        showToastOnError: false,
        signal: controller.signal,
      }),
      apiFetch(`/api/records?tab=${tabForScope}&status=CLOSED&limit=1`, {
        showToastOnError: false,
        signal: controller.signal,
      }),
    ])
      .then(async ([openRes, pendingRes, closedRes]) => {
        if (controller.signal.aborted) return;
        const [openJson, pendingJson, closedJson] = await Promise.all([
          openRes.ok ? openRes.json() : { data: { records: [] } },
          pendingRes.ok ? pendingRes.json() : { data: { records: [] } },
          closedRes.ok ? closedRes.json() : { data: { records: [] } },
        ]);
        setCounts({
          open: (openJson as { data: { records: unknown[] } }).data.records.length > 0 ? 1 : 0,
          pending:
            (pendingJson as { data: { records: unknown[] } }).data.records.length > 0 ? 1 : 0,
          closed:
            (closedJson as { data: { records: unknown[] } }).data.records.length > 0 ? 1 : 0,
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [apiFetch, canReadAll]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[
        { label: "Open", value: counts ? (counts.open > 0 ? "Yes" : "None") : "…" },
        {
          label: "Pending approval",
          value: counts ? (counts.pending > 0 ? "Yes" : "None") : "…",
        },
        { label: "Closed", value: counts ? (counts.closed > 0 ? "Yes" : "None") : "…" },
      ].map((k) => (
        <div
          key={k.label}
          className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3"
        >
          <p className="text-xs font-medium tracking-wider text-(--text-muted) uppercase">
            {k.label}
          </p>
          <p className="mt-1 text-lg font-semibold text-(--text-primary)">{k.value}</p>
        </div>
      ))}
    </div>
  );
}

function RecordsList({
  records,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  tab,
  canCreate,
  onNavigate,
}: {
  records: RecordListItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  tab: Tab | string;
  canCreate: boolean;
  onNavigate: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)">
        {error}
      </div>
    );
  }

  if (records.length === 0) {
    const emptyMessages: Record<string, string> = {
      my: "You haven't created any requests yet.",
      inbox: "No pending approvals. You're all caught up.",
      mentioned: "No unread mentions.",
      shared: "No requests have been shared with you.",
      all: "No requests found.",
    };
    return (
      <EmptyState
        title="No requests"
        description={emptyMessages[tab] ?? "No requests found."}
        icon={<IconFileText size={32} />}
        action={
          canCreate && tab === "my"
            ? { label: "Create request", href: "/app/requests/new" }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <RecordRow key={r.id} record={r} onClick={() => onNavigate(r.id)} />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-60"
          >
            {loadingMore ? <Spinner size="sm" /> : null}
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function RecordRow({ record, onClick }: { record: RecordListItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-left transition-colors hover:border-(--border-strong) hover:bg-(--bg-surface-hover)"
    >
      <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
        {record.hasCriticalComment && (
          <IconAlertCircle
            size={14}
            className="text-(--color-danger)"
            aria-label="Action required"
          />
        )}
        {record.hasUnreadMention && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-primary)"
            aria-label="Unread mention"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-(--text-primary)">{record.title}</span>
          <Badge variant={RECORD_STATUS_BADGE[record.status]}>
            {RECORD_STATUS_LABELS[record.status]}
          </Badge>
          <span className="rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 text-xs text-(--text-muted)">
            {RECORD_TYPE_LABELS[record.type]}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-(--text-muted)">
          {record.amount != null && <span>{formatAmount(record.amount, record.currency)}</span>}
          <span>{formatDate(record.createdAt)}</span>
        </div>
      </div>
    </button>
  );
}
