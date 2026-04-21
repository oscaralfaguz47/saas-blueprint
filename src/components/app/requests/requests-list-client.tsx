"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  IconClock,
  IconDollarSign,
  IconShield,
} from "@/components/ui/icons";
import {
  formatAmount,
  formatDate,
  getBestAmount,
  RECORD_TYPE_LABELS,
  RECORD_STATUS_BADGE,
  RECORD_STATUS_LABELS,
  RECORD_APPROVAL_STATUS_LABELS,
  type BadgeVariant,
} from "@/lib/record-utils";
import type { RecordApprovalStatus, RecordListItem, RecordPriority, RecordType } from "@/types/records";
import { useCreateRequestModal } from "./create-request-modal-context";

type ApiTab = "my" | "inbox" | "mentioned" | "shared" | "all";
type UiTab = "my" | "inbox" | "awaiting_approval" | "mentioned" | "shared" | "all";

type SortOption =
  | "newest"
  | "oldest"
  | "amount_desc"
  | "amount_asc"
  | "needed_by_asc"
  | "updated_desc";

type SummaryPayload = {
  openCount: number;
  pendingMyApprovalCount: number;
  overdueCount: number;
  awaitingInfoCount: number;
  hasPolicyExceptionCount: number;
  totalOpenAmount: number | null;
};

type Filters = {
  status: string;
  category: string;
  priority: string;
  overdueOnly: boolean;
  policyExceptionOnly: boolean;
  amountMin: string;
  amountMax: string;
  currency: string;
  neededByFrom: string;
  neededByTo: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  status: "",
  category: "",
  priority: "",
  overdueOnly: false,
  policyExceptionOnly: false,
  amountMin: "",
  amountMax: "",
  currency: "",
  neededByFrom: "",
  neededByTo: "",
  dateFrom: "",
  dateTo: "",
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
  { value: "needed_by_asc", label: "Needed by soonest" },
  { value: "updated_desc", label: "Recently updated" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "NO_RESPONSE", label: "No Response" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "AWAITING_INFO", label: "Awaiting Info" },
  { value: "CANCELED", label: "Canceled" },
];

/** Finance-oriented record types first, legacy types last. */
const RECORD_TYPES_FINANCE: RecordType[] = [
  "BUDGET_REQUEST",
  "SPEND_APPROVAL",
  "VENDOR_PAYMENT_REQUEST",
  "REIMBURSEMENT",
  "FINANCIAL_EXCEPTION",
  "CONTRACT_SCOPE_CHANGE",
  "FORECAST_ADJUSTMENT",
  "OTHER_FINANCIAL_REQUEST",
];

const RECORD_TYPES_LEGACY: RecordType[] = ["SCOPE_CHANGE", "DECISION", "BUDGET"];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any priority" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

type TabSpec = { value: UiTab; label: string; apiTab: ApiTab; inboxBadge?: boolean };

const BASE_TAB_SPECS: TabSpec[] = [
  { value: "my", label: "My Requests", apiTab: "my" },
  { value: "inbox", label: "Inbox", apiTab: "inbox", inboxBadge: true },
  { value: "awaiting_approval", label: "Awaiting my approval", apiTab: "inbox", inboxBadge: true },
  { value: "mentioned", label: "Mentioned", apiTab: "mentioned" },
  { value: "shared", label: "Shared with me", apiTab: "shared" },
];

type Props = {
  canCreate: boolean;
  canReadAll: boolean;
  workspaceCurrency?: string;
};

function getApiTab(ui: UiTab): ApiTab {
  if (ui === "awaiting_approval") return "inbox";
  return ui;
}

function normalizeListItem(
  raw: RecordListItem & { amount?: unknown; requestedAmount?: unknown }
): RecordListItem {
  const coerceNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...raw,
    amount: coerceNum(raw.amount),
    requestedAmount: coerceNum(raw.requestedAmount),
  };
}

function dateStartIso(d: string): string {
  return `${d}T00:00:00.000Z`;
}

function dateEndIso(d: string): string {
  return `${d}T23:59:59.999Z`;
}

function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.status) n++;
  if (f.category) n++;
  if (f.priority) n++;
  if (f.overdueOnly) n++;
  if (f.policyExceptionOnly) n++;
  if (f.amountMin) n++;
  if (f.amountMax) n++;
  if (f.currency) n++;
  if (f.neededByFrom) n++;
  if (f.neededByTo) n++;
  if (f.dateFrom) n++;
  if (f.dateTo) n++;
  return n;
}

const APPROVAL_STATUS_BADGE: Partial<Record<RecordApprovalStatus, BadgeVariant>> = {
  WAITING_FOR_APPROVAL: "warning",
  FULLY_APPROVED: "success",
  APPROVAL_REJECTED: "destructive",
  APPROVAL_EXPIRED: "destructive",
};

function getNeededByUrgency(dateStr: string | null | undefined): {
  label: string;
  urgent: boolean;
  overdue: boolean;
} | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) {
    return { label: `Overdue by ${Math.abs(diffDays)}d`, urgent: true, overdue: true };
  }
  if (diffDays === 0) {
    return { label: "Due today", urgent: true, overdue: false };
  }
  if (diffDays <= 3) {
    return { label: `Due in ${diffDays}d`, urgent: true, overdue: false };
  }
  return { label: `Due ${formatDate(dateStr)}`, urgent: false, overdue: false };
}

function priorityAccentClass(priority: RecordPriority | undefined): string {
  switch (priority) {
    case "LOW":
      return "border-l-[3px] border-l-(--border-strong)";
    case "HIGH":
      return "border-l-[3px] border-l-(--color-warning)";
    case "URGENT":
      return "border-l-[3px] border-l-(--color-danger)";
    case "MEDIUM":
    default:
      return "border-l-[3px] border-l-(--color-primary)";
  }
}

function NeededByLine({ neededByDate }: { neededByDate: string | null | undefined }) {
  const u = getNeededByUrgency(neededByDate);
  if (!u) return <span className="shrink-0 text-xs text-(--text-muted)">—</span>;

  const colorClass = u.overdue
    ? "text-(--color-danger)"
    : u.urgent
      ? "text-(--color-warning)"
      : "text-(--text-muted)";

  return (
    <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${colorClass}`}>
      {u.label}
      {(u.overdue || u.urgent) && (
        <IconAlertCircle
          size={14}
          className="shrink-0"
          aria-label={u.overdue ? "Overdue" : "Due soon"}
        />
      )}
    </span>
  );
}

export function RequestsListClient({ canCreate, canReadAll, workspaceCurrency }: Props) {
  const { openCreateRequestModal } = useCreateRequestModal();
  const router = useRouter();
  const apiFetch = useApiFetch();

  const tabSpecs = useMemo<TabSpec[]>(
    () => (canReadAll ? [...BASE_TAB_SPECS, { value: "all", label: "All", apiTab: "all" }] : BASE_TAB_SPECS),
    [canReadAll]
  );

  const [tab, setTab] = useState<UiTab>("my");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
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
  const sortRef = useRef(sort);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);

  const activeFilterCount = countActiveFilters(filters);
  const isFilteredOrSearch = activeFilterCount > 0 || search.trim().length > 0;

  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryFailed, setSummaryFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryFailed(false);
    void (async () => {
      try {
        const res = await apiFetch("/api/records/summary", {
          signal: controller.signal,
          showToastOnError: false,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setSummary(null);
          setSummaryFailed(true);
          return;
        }
        const json = (await res.json()) as { data: SummaryPayload };
        if (controller.signal.aborted) return;
        setSummary(json.data);
        setSummaryFailed(false);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setSummary(null);
        setSummaryFailed(true);
      } finally {
        if (!controller.signal.aborted) setSummaryLoading(false);
      }
    })();
    return () => controller.abort();
  }, [apiFetch]);

  const fetchRecords = useCallback(
    async (activeUiTab: UiTab, searchTerm: string, cursor: string | null, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!append) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const f = filtersRef.current;
        const apiTab = getApiTab(activeUiTab);
        const params = new URLSearchParams({
          tab: apiTab,
          limit: "25",
          sort: sortRef.current,
        });
        if (searchTerm) params.set("search", searchTerm);
        if (cursor) params.set("cursor", cursor);
        if (f.status) params.set("status", f.status);
        if (f.category) params.set("category", f.category);
        if (f.priority) params.set("priority", f.priority);
        if (f.overdueOnly) params.set("overdue", "true");
        if (f.policyExceptionOnly) params.set("hasPolicyException", "true");
        const minAmt = f.amountMin === "" ? NaN : Number(f.amountMin);
        if (Number.isFinite(minAmt) && minAmt > 0) params.set("amountMin", String(minAmt));
        const maxAmt = f.amountMax === "" ? NaN : Number(f.amountMax);
        if (Number.isFinite(maxAmt) && maxAmt > 0) params.set("amountMax", String(maxAmt));
        if (f.currency) params.set("currency", f.currency);
        if (f.neededByFrom) params.set("neededByFrom", dateStartIso(f.neededByFrom));
        if (f.neededByTo) params.set("neededByTo", dateEndIso(f.neededByTo));
        if (f.dateFrom) params.set("dateFrom", dateStartIso(f.dateFrom));
        if (f.dateTo) params.set("dateTo", dateEndIso(f.dateTo));

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
            records: (RecordListItem & { amount?: unknown; requestedAmount?: unknown })[];
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
  }, [tab, search, filters, sort, fetchRecords]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleTabChange(value: string) {
    setTab(value as UiTab);
    setSearchInput("");
    setSearch("");
  }

  function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    void fetchRecords(tab, search, nextCursor, true);
  }

  function clearAllFiltersAndSearch() {
    setFilters(EMPTY_FILTERS);
    setSort("newest");
    setSearchInput("");
    setSearch("");
  }

  const displaySummary = summaryFailed || !summary ? null : summary;
  const pendingBadge =
    displaySummary && displaySummary.pendingMyApprovalCount > 0
      ? displaySummary.pendingMyApprovalCount
      : null;

  const dash = "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-widest text-(--color-primary) uppercase">
            Workspace
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-(--text-primary)">Requests</h1>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() =>
              openCreateRequestModal({ workspaceCurrency: workspaceCurrency ?? "USD" })
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--color-primary) px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--color-primary-hover)"
          >
            <IconPlus size={16} />
            New request
          </button>
        )}
      </div>

      <section aria-label="Summary metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summaryLoading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <MetricCard
              label="Open requests"
              value={displaySummary ? String(displaySummary.openCount) : dash}
              icon={<IconFileText size={18} className="text-(--text-muted)" />}
              tone="neutral"
            />
            <MetricCard
              label="Pending my approval"
              value={displaySummary ? String(displaySummary.pendingMyApprovalCount) : dash}
              icon={<IconClock size={18} className="text-(--text-muted)" />}
              tone={
                displaySummary && displaySummary.pendingMyApprovalCount > 0 ? "warning" : "neutral"
              }
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setTab("inbox");
                setShowFilters(false);
              }}
            />
            <MetricCard
              label="Total open value"
              value={
                displaySummary && displaySummary.totalOpenAmount != null
                  ? formatAmount(displaySummary.totalOpenAmount, "USD")
                  : dash
              }
              icon={<IconDollarSign size={18} className="text-(--text-muted)" />}
              tone="neutral"
            />
            <MetricCard
              label="Overdue"
              value={displaySummary ? String(displaySummary.overdueCount) : dash}
              icon={<IconAlertCircle size={18} className="text-(--text-muted)" />}
              tone={displaySummary && displaySummary.overdueCount > 0 ? "destructive" : "neutral"}
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, overdueOnly: true });
                setShowFilters(true);
                setTab(canReadAll ? "all" : "my");
              }}
            />
            <MetricCard
              label="Policy exceptions"
              value={displaySummary ? String(displaySummary.hasPolicyExceptionCount) : dash}
              icon={<IconShield size={18} className="text-(--text-muted)" />}
              tone={
                displaySummary && displaySummary.hasPolicyExceptionCount > 0 ? "warning" : "neutral"
              }
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, policyExceptionOnly: true });
                setShowFilters(true);
                setTab(canReadAll ? "all" : "my");
              }}
            />
          </>
        )}
      </section>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="space-y-4">
          <TabsList>
            {tabSpecs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                <span className="flex items-center gap-1.5">
                  {t.label}
                  {t.inboxBadge && pendingBadge != null ? (
                    <span className="rounded-full bg-(--color-warning-soft) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-warning)">
                      {pendingBadge}
                    </span>
                  ) : null}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-[200px] flex-1 sm:max-w-md">
              <IconSearch
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--text-muted)"
              />
              <Input
                type="search"
                placeholder="Search requests..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="requests-sort">
                Sort requests
              </label>
              <select
                id="requests-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="h-10 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-focus-ring) focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
                {activeFilterCount > 0 ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-primary) px-1 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          {showFilters ? (
            <FiltersPanel filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
          ) : null}

          {tabSpecs.map((t) => (
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
                uiTab={t.value}
                canCreate={canCreate}
                isFilteredOrSearch={isFilteredOrSearch}
                onNavigate={(id) => router.push(`/app/requests/${id}`)}
                onClearFilters={clearAllFiltersAndSearch}
                onNewRequest={
                  canCreate
                    ? () =>
                        openCreateRequestModal({
                          workspaceCurrency: workspaceCurrency ?? "USD",
                        })
                    : undefined
                }
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "neutral" | "warning" | "destructive";
  onClick?: () => void;
}) {
  const valueColor =
    tone === "warning"
      ? "text-(--color-warning)"
      : tone === "destructive"
        ? "text-(--color-danger)"
        : "text-(--text-primary)";

  const iconColor =
    tone === "warning"
      ? "text-(--color-warning)"
      : tone === "destructive"
        ? "text-(--color-danger)"
        : "text-(--text-muted)";

  const inner = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-none font-semibold tracking-widest text-(--text-muted) uppercase">
          {label}
        </p>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className={`text-2xl leading-none font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );

  const baseClass = [
    "rounded-xl border border-(--border-subtle) ",
    "bg-(--bg-surface) px-4 py-4 text-left ",
    "transition-all duration-150 ",
    onClick
      ? "cursor-pointer hover:border-(--border-strong) " +
        "hover:bg-(--bg-surface-hover) hover:shadow-sm"
      : "",
    tone !== "neutral" ? "border-l-2 border-l-current" : "",
  ].join("");

  if (onClick) {
    return (
      <button
        type="button"
        className={baseClass}
        onClick={onClick}
        style={{
          borderLeftColor:
            tone === "warning"
              ? "var(--color-warning)"
              : tone === "destructive"
                ? "var(--color-danger)"
                : undefined,
        }}
      >
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const hasAdvancedFilters =
    Boolean(filters.amountMin) ||
    Boolean(filters.amountMax) ||
    Boolean(filters.currency) ||
    Boolean(filters.neededByFrom) ||
    Boolean(filters.neededByTo) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.policyExceptionOnly;

  const selectClass =
    "w-full rounded-lg border border-(--border-subtle) " +
    "bg-(--bg-surface) px-3 py-2 text-sm " +
    "text-(--text-primary) " +
    "transition-colors focus:ring-2 focus:ring-(--color-focus-ring) " +
    "focus:outline-none";

  return (
    <div className="overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev)">
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => set("status", e.target.value)}
              className={selectClass}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || "any-status"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => set("category", e.target.value)}
              className={selectClass}
            >
              <option value="">Any category</option>
              <optgroup label="Finance">
                {RECORD_TYPES_FINANCE.map((rt) => (
                  <option key={rt} value={rt}>
                    {RECORD_TYPE_LABELS[rt]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Legacy">
                {RECORD_TYPES_LEGACY.map((rt) => (
                  <option key={rt} value={rt}>
                    {RECORD_TYPE_LABELS[rt]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
              Priority
            </label>
            <select
              value={filters.priority}
              onChange={(e) => set("priority", e.target.value)}
              className={selectClass}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value || "any-priority"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
              Quick filters
            </label>
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary) transition-colors hover:text-(--text-primary)">
                <input
                  type="checkbox"
                  checked={filters.overdueOnly}
                  onChange={(e) => set("overdueOnly", e.target.checked)}
                  className="rounded border-(--border-subtle) accent-(--color-primary)"
                />
                Overdue only
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary) transition-colors hover:text-(--text-primary)">
                <input
                  type="checkbox"
                  checked={filters.policyExceptionOnly}
                  onChange={(e) => set("policyExceptionOnly", e.target.checked)}
                  className="rounded border-(--border-subtle) accent-(--color-primary)"
                />
                Policy exception
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-(--border-subtle)">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-(--text-muted) transition-colors hover:text-(--text-primary)"
        >
          <span className="flex items-center gap-2">
            <span>Advanced filters</span>
            {hasAdvancedFilters ? (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-(--color-primary) text-[9px] font-bold text-white">
                •
              </span>
            ) : null}
          </span>
          <span
            className={`text-(--text-muted) transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>

        {showAdvanced ? (
          <div className="space-y-3 px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Min amount
                </label>
                <Input
                  type="number"
                  min="0"
                  value={filters.amountMin}
                  onChange={(e) => set("amountMin", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Max amount
                </label>
                <Input
                  type="number"
                  min="0"
                  value={filters.amountMax}
                  onChange={(e) => set("amountMax", e.target.value)}
                  placeholder="∞"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Currency
                </label>
                <Input
                  value={filters.currency}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                  placeholder="USD"
                  maxLength={3}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Needed by (from)
                </label>
                <Input
                  type="date"
                  value={filters.neededByFrom}
                  onChange={(e) => set("neededByFrom", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Needed by (to)
                </label>
                <Input
                  type="date"
                  value={filters.neededByTo}
                  onChange={(e) => set("neededByTo", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Created from
                </label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Created to
                </label>
                <Input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-(--border-subtle) px-4 py-2.5">
        <p className="text-xs text-(--text-muted)">
          {countActiveFilters(filters) > 0
            ? `${countActiveFilters(filters)} filter${countActiveFilters(filters) === 1 ? "" : "s"} active`
            : "No filters active"}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-(--text-muted) transition-colors hover:text-(--color-primary)"
        >
          Clear all
        </button>
      </div>
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
  uiTab,
  canCreate,
  isFilteredOrSearch,
  onNavigate,
  onClearFilters,
  onNewRequest,
}: {
  records: RecordListItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  uiTab: UiTab;
  canCreate: boolean;
  isFilteredOrSearch: boolean;
  onNavigate: (id: string) => void;
  onClearFilters: () => void;
  onNewRequest?: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
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
    if (uiTab === "my" && !isFilteredOrSearch) {
      return (
        <EmptyState
          title="No financial requests yet"
          description="Financial requests your team creates will appear here."
          icon={<IconFileText size={32} />}
            action={
            onNewRequest ? { label: "+ New request", onClick: onNewRequest } : undefined
          }
        />
      );
    }

    if (isFilteredOrSearch) {
      return (
        <EmptyState
          title="No requests found"
          description="No requests match your current filters."
          icon={<IconFileText size={32} />}
          action={{ label: "Clear filters", onClick: onClearFilters }}
        />
      );
    }

    const tabMessages: Partial<Record<UiTab, string>> = {
      inbox: "No pending approvals. You're all caught up.",
      awaiting_approval: "No pending approvals. You're all caught up.",
      mentioned: "No unread mentions.",
      shared: "No requests have been shared with you.",
      all: "No requests found.",
    };
    return (
      <EmptyState
        title="No requests"
        description={tabMessages[uiTab] ?? "No requests found."}
        icon={<IconFileText size={32} />}
      />
    );
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <RecordRow key={r.id} record={r} onClick={() => onNavigate(r.id)} />
      ))}
      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-6 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-60"
          >
            {loadingMore ? <Spinner size="sm" /> : null}
            {loadingMore ? "Loading…" : "Load more requests"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RecordRow({ record, onClick }: { record: RecordListItem; onClick: () => void }) {
  const { amount, currency } = getBestAmount(record);
  const approval = record.approvalStatus;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group w-full rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-4 text-left transition-all duration-150 hover:border-(--border-strong) hover:bg-(--bg-surface-hover) hover:shadow-sm " +
        priorityAccentClass(record.priority)
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={RECORD_STATUS_BADGE[record.status]} className="shrink-0">
            {RECORD_STATUS_LABELS[record.status]}
          </Badge>
          <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-2 py-0.5 text-[11px] font-medium text-(--text-muted)">
            {RECORD_TYPE_LABELS[record.type]}
          </span>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-(--text-primary)">
          {formatAmount(amount, currency)}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm leading-snug font-semibold text-(--text-primary) transition-colors group-hover:text-(--color-primary)">
          {record.title}
        </span>
        <NeededByLine neededByDate={record.neededByDate} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
        {record.recordKey ? (
          <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 font-mono text-[11px] text-(--text-secondary)">
            {record.recordKey}
          </span>
        ) : null}
        <span>Created {formatDate(record.createdAt)}</span>
        {approval &&
        approval !== "NOT_STARTED" &&
        approval !== "NO_APPROVERS_ASSIGNED" &&
        APPROVAL_STATUS_BADGE[approval] ? (
          <Badge
            variant={APPROVAL_STATUS_BADGE[approval]!}
            className="!px-2 !py-0 text-[10px]"
          >
            {RECORD_APPROVAL_STATUS_LABELS[approval]}
          </Badge>
        ) : null}
        {record.overdue ? (
          <Badge variant="destructive" className="!px-2 !py-0 text-[10px]">
            Overdue
          </Badge>
        ) : null}
        {record.hasPolicyException ? (
          <Badge variant="warning" className="!px-2 !py-0 text-[10px]">
            Policy exception
          </Badge>
        ) : null}
        {record.hasUnreadMention ? (
          <span className="rounded-md border border-(--color-warning-soft) bg-(--color-warning-soft) px-1.5 py-0.5 text-[10px] font-medium text-(--color-warning)">
            Mention
          </span>
        ) : null}
        {record.hasCriticalComment ? (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md bg-(--color-danger-soft) text-xs font-bold text-(--color-danger)"
            aria-label="Action required"
          >
            !
          </span>
        ) : null}
      </div>
    </button>
  );
}
