"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  IconTrendingUp,
  IconShield,
  IconX,
  IconEye,
  IconEyeCheck,
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
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import type { RecordApprovalStatus, RecordListItem, RecordPriority, RecordType } from "@/types/records";
import {
  useCreateRequestModal,
  type CreatedRecordPayload,
} from "./create-request-modal-context";

type ApiTab = "my" | "inbox" | "mentioned" | "shared" | "all";
type UiTab = "my" | "awaiting_approval" | "mentioned" | "shared" | "all";

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
  unreadMentionCount: number;
  overdueCount: number;
  awaitingInfoCount: number;
  hasPolicyExceptionCount: number;
  totalOpenAmount: number | null;
  totalOpenAmountByCurrency: Record<string, number>;
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

type TabSpec = {
  value: UiTab;
  label: string;
  apiTab: ApiTab;
  inboxBadge?: boolean;
  mentionBadge?: boolean;
  sharedBadge?: boolean;
};

const BASE_TAB_SPECS: TabSpec[] = [
  { value: "my", label: "My Requests", apiTab: "my" },
  { value: "awaiting_approval", label: "Awaiting my approval", apiTab: "inbox", inboxBadge: true },
  { value: "mentioned", label: "Mentioned", apiTab: "mentioned", mentionBadge: true },
  { value: "shared", label: "Shared with me", apiTab: "shared", sharedBadge: true },
];

type Props = {
  canCreate: boolean;
  canReadAll: boolean;
  workspaceCurrency?: string;
  /** Split-view: called instead of router.push when set */
  onNavigate?: (id: string, recordKey?: string | null) => void;
  /** Split-view: currently selected record id (highlights the row) */
  selectedId?: string;
  /** Split-view: compact mode hides metric cards grid labels, reduces padding */
  compact?: boolean;
  /**
   * When true, uses flex h-full layout with a sticky chrome and scrollable rows.
   * Set false when the parent scroll container handles scrolling (e.g. mobile list).
   */
  heightConstrained?: boolean;
  /** Split-view: called after a new request is created — payload used for optimistic insert */
  onCreated?: (payload: CreatedRecordPayload) => void;
  /** Split-view: subtract from unread mention badge after PATCH /mentions succeeds (no refetch) */
  mentionsReadOffset?: number;
  /** Split-view: subtract from shared-with-me badge after PATCH /access-viewed succeeds (no refetch) */
  sharedReadOffset?: number;
  /** Split-view: subtract from awaiting-approval badge after approve/reject in detail (until summary revalidates) */
  approvalCompletedOffset?: number;
  onMarkMentionRead?: (recordId: string) => void;
  onMarkSharedRead?: (recordId: string) => void;
  onSummaryRevalidated?: () => void;
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

export function RequestsListClient({
  canCreate,
  canReadAll,
  workspaceCurrency,
  onNavigate: onNavigateOverride,
  selectedId,
  compact = false,
  heightConstrained = true,
  onCreated,
  mentionsReadOffset = 0,
  sharedReadOffset = 0,
  approvalCompletedOffset = 0,
  onMarkMentionRead,
  onMarkSharedRead,
  onSummaryRevalidated,
}: Props) {
  const { openCreateRequestModal } = useCreateRequestModal();
  const router = useRouter();
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => {
    apiFetchRef.current = apiFetch;
  }, [apiFetch]);

  const tabSpecs = useMemo<TabSpec[]>(
    () =>
      canReadAll
        ? [{ value: "all", label: "All", apiTab: "all" }, ...BASE_TAB_SPECS]
        : BASE_TAB_SPECS,
    [canReadAll]
  );

  const [tab, setTab] = useState<UiTab>(canReadAll ? "all" : "my");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [records, setRecords] = useState<RecordListItem[]>([]);
  const recordsRef = useRef<RecordListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const filterContainerRef = useRef<HTMLDivElement>(null);
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
  // Keyboard navigation: J = next record, K = previous record, Enter = open focused record
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const summaryFetchedAtRef = useRef<number>(0);
  const tabFetchedAtRef = useRef<Partial<Record<UiTab, number>>>({});
  const lastTabRef = useRef<UiTab>(tab);
  const lastSearchFiltersRef = useRef<string>("");
  const SUMMARY_STALE_MS = 0; // always revalidate summary on visibility change
  const RECORDS_STALE_MS = 0; // always revalidate records on visibility change

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryFailed(false);
    void (async () => {
      try {
        const res = await apiFetchRef.current("/api/records/summary", {
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
        setSummary({
          ...json.data,
          unreadMentionCount: json.data.unreadMentionCount ?? 0,
          totalOpenAmountByCurrency: json.data.totalOpenAmountByCurrency ?? {},
        });
        setSummaryFailed(false);
        summaryFetchedAtRef.current = Date.now();
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setSummary(null);
        setSummaryFailed(true);
      } finally {
        if (!controller.signal.aborted) setSummaryLoading(false);
      }
    })();
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — apiFetch via stable ref, runs once on mount

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

        const res = await apiFetchRef.current(`/api/records?${params}`, {
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
        if (!append) {
          tabFetchedAtRef.current = { ...tabFetchedAtRef.current, [activeUiTab]: Date.now() };
        }
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
    [] // eslint-disable-line react-hooks/exhaustive-deps — apiFetch via stable ref
  );

  const revalidateSummary = useCallback(async () => {
    try {
      const res = await apiFetchRef.current("/api/records/summary", {
        showToastOnError: false,
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: SummaryPayload };
      setSummary({
        ...json.data,
        unreadMentionCount: json.data.unreadMentionCount ?? 0,
        totalOpenAmountByCurrency: json.data.totalOpenAmountByCurrency ?? {},
      });
      summaryFetchedAtRef.current = Date.now();
      onSummaryRevalidated?.();
    } catch {
      /* silent */
    }
  }, [onSummaryRevalidated]);

  const revalidateCurrentTab = useCallback(async (currentTab: UiTab, currentSearch: string) => {
    try {
      const f = filtersRef.current;
      const apiTab = getApiTab(currentTab);
      const params = new URLSearchParams({
        tab: apiTab,
        limit: "25",
        sort: sortRef.current,
      });
      if (currentSearch) params.set("search", currentSearch);
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

      const res = await apiFetchRef.current(`/api/records?${params}`, {
        showToastOnError: false,
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: {
          records: (RecordListItem & { amount?: unknown; requestedAmount?: unknown })[];
          nextCursor: string | null;
          hasMore: boolean;
        };
      };
      const newRecords = json.data.records.map(normalizeListItem);
      setRecords((prev) => {
        // Always replace with fresh server data — server is source of truth for
        // hasUnreadMention, hasSharedUnviewed, status, etc.
        // Only skip if arrays are referentially identical (shouldn't happen but guard anyway)
        if (prev === newRecords) return prev;
        return newRecords;
      });
      setNextCursor(json.data.nextCursor);
      setHasMore(json.data.hasMore);
      tabFetchedAtRef.current = { ...tabFetchedAtRef.current, [currentTab]: Date.now() };
    } catch {
      /* silent */
    }
  }, []);

  // Optimistic insert: prepend the newly created record to the list
  // without re-fetching. Only applies to the "my" tab since new records
  // are always created by the current user.
  const handleOptimisticCreate = useCallback(
    (payload: CreatedRecordPayload) => {
      const newItem: RecordListItem = {
        id: payload.id,
        title: payload.title,
        type: payload.type as RecordType,
        status: payload.status as RecordListItem["status"],
        createdAt: payload.createdAt,
        priority: payload.priority as RecordPriority,
        requestedAmount: payload.requestedAmount,
        currencyCode: payload.currencyCode,
        neededByDate: payload.neededByDate,
        recordKey: payload.recordKey,
        amount: null,
        currency: null,
        approvalStatus: "NOT_STARTED",
        overdue: false,
        hasPolicyException: false,
        hasCriticalComment: false,
        hasUnreadMention: false,
        hasSharedUnviewed: false,
        createdByUserId: "",
      };
      if (tab === "my") {
        setRecords((prev) => {
          if (prev.some((r) => r.id === payload.id)) return prev;
          return [
            normalizeListItem(
              newItem as RecordListItem & { amount?: unknown; requestedAmount?: unknown }
            ),
            ...prev,
          ];
        });
      }

      // Optimistically update summary cards — no fetch needed
      setSummary((prev) => {
        if (!prev) return prev;
        const isOpen =
          payload.status === "OPEN" ||
          payload.status === "IN_REVIEW" ||
          payload.status === "PENDING_APPROVAL" ||
          payload.status === "AWAITING_INFO";
        if (!isOpen) return prev;

        const updatedByCurrency = { ...prev.totalOpenAmountByCurrency };
        if (payload.requestedAmount != null && payload.currencyCode) {
          updatedByCurrency[payload.currencyCode] =
            (updatedByCurrency[payload.currencyCode] ?? 0) + payload.requestedAmount;
        }

        return {
          ...prev,
          openCount: prev.openCount + 1,
          totalOpenAmount:
            payload.requestedAmount != null
              ? (prev.totalOpenAmount ?? 0) + payload.requestedAmount
              : prev.totalOpenAmount,
          totalOpenAmountByCurrency: updatedByCurrency,
        };
      });

      onCreated?.(payload);
    },
    [tab, onCreated]
  );

  const handleMarkMentionRead = useCallback(
    (recordId: string) => {
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, hasUnreadMention: false } : r))
      );
      onMarkMentionRead?.(recordId);
    },
    [onMarkMentionRead]
  );

  const handleMarkSharedRead = useCallback(
    (recordId: string) => {
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, hasSharedUnviewed: false } : r))
      );
      onMarkSharedRead?.(recordId);
    },
    [onMarkSharedRead]
  );

  useEffect(() => {
    function handleMentionRead(e: Event) {
      const recordId = (e as CustomEvent<{ recordId: string }>).detail?.recordId;
      if (!recordId) return;
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, hasUnreadMention: false } : r))
      );
    }
    function handleSharedRead(e: Event) {
      const recordId = (e as CustomEvent<{ recordId: string }>).detail?.recordId;
      if (!recordId) return;
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, hasSharedUnviewed: false } : r))
      );
    }
    window.addEventListener("record-mention-read", handleMentionRead);
    window.addEventListener("record-shared-read", handleSharedRead);
    return () => {
      window.removeEventListener("record-mention-read", handleMentionRead);
      window.removeEventListener("record-shared-read", handleSharedRead);
    };
  }, []);

  useEffect(() => {
    function handleApprovalCompleted(e: Event) {
      const recordId = (e as CustomEvent<{ recordId: string }>).detail?.recordId;
      if (!recordId) return;
      if (tab === "awaiting_approval") {
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
      }
    }
    window.addEventListener("record-approval-completed", handleApprovalCompleted);
    return () => window.removeEventListener("record-approval-completed", handleApprovalCompleted);
  }, [tab]);

  useEffect(() => {
    const searchFiltersKey = `${search}\0${JSON.stringify(filters)}\0${sort}`;
    const tabChanged = tab !== lastTabRef.current;
    const searchFiltersChanged = searchFiltersKey !== lastSearchFiltersRef.current;
    lastTabRef.current = tab;
    lastSearchFiltersRef.current = searchFiltersKey;

    const lastFetched = tabFetchedAtRef.current[tab] ?? 0;
    const hasData = lastFetched > 0;
    const isStale = Date.now() - lastFetched > RECORDS_STALE_MS;

    if (!hasData) {
      // Never loaded this tab — full fetch with loading state
      setRecords([]);
      setNextCursor(null);
      void fetchRecords(tab, search, null, false);
    } else if (searchFiltersChanged) {
      // Search/filter/sort changed — full fetch regardless of tab
      setRecords([]);
      setNextCursor(null);
      void fetchRecords(tab, search, null, false);
    } else if (tabChanged || isStale) {
      // Tab switched with existing data OR stale — silent revalidation
      void revalidateCurrentTab(tab, search);
    }
    // hasData && !searchFiltersChanged && !tabChanged && !isStale → do nothing
  }, [tab, search, filters, sort, fetchRecords, revalidateCurrentTab]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) return;
      const now = Date.now();

      if (now - summaryFetchedAtRef.current > SUMMARY_STALE_MS) {
        void revalidateSummary();
      }

      const lastFetched = tabFetchedAtRef.current[tab] ?? 0;
      if (now - lastFetched > RECORDS_STALE_MS) {
        void revalidateCurrentTab(tab, search);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [tab, search, revalidateSummary, revalidateCurrentTab]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't trigger if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, records.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0 && records[focusedIndex]) {
        const id = records[focusedIndex]!.id;
        try {
          sessionStorage.setItem(
            "rlt_request_nav_list",
            JSON.stringify(records.map((r) => r.id))
          );
        } catch {
          // ignore
        }
        if (onNavigateOverride) {
          onNavigateOverride(id, records[focusedIndex]?.recordKey ?? null);
        } else {
          router.push(`/app/requests/${id}`);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [records, focusedIndex, router, onNavigateOverride]);

  // Reset focused index when records change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [tab, search, filters]);

  // Close filters panel when clicking outside
  useEffect(() => {
    if (!showFilters) return;
    function handleClickOutside(e: MouseEvent) {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilters]);

  function handleTabChange(value: string) {
    const newTab = value as UiTab;
    setTab(newTab);
    setSearchInput("");
    setSearch("");
    // Always revalidate summary — lightweight, ensures fresh badge counts
    void revalidateSummary();
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
  const pendingBadge = (() => {
    const raw = displaySummary?.pendingMyApprovalCount ?? 0;
    const adjusted = Math.max(0, raw - approvalCompletedOffset);
    return adjusted > 0 ? adjusted : null;
  })();

  const mentionBadge = (() => {
    const raw =
      (displaySummary as { unreadMentionCount?: number } | null)?.unreadMentionCount ?? 0;
    const adjusted = Math.max(0, raw - mentionsReadOffset);
    return adjusted > 0 ? adjusted : null;
  })();

  const sharedBadge = (() => {
    const raw =
      (displaySummary as { sharedWithMeCount?: number } | null)?.sharedWithMeCount ?? 0;
    const adjusted = Math.max(0, raw - sharedReadOffset);
    return adjusted > 0 ? adjusted : null;
  })();

  const dash = "—";

  return (
    <div
      className={
        heightConstrained ? "flex h-full flex-col overflow-hidden" : "space-y-4"
      }
    >
      <div className="shrink-0 space-y-3">
        {!compact && (
        <>
          {/* Attention banner — only shown when not already on awaiting approval tab */}
          {tab !== "awaiting_approval" && displaySummary && displaySummary.pendingMyApprovalCount > 0 ? (
            <AttentionBanner
              pendingApprovalCount={displaySummary.pendingMyApprovalCount}
              onGoToInbox={() => setTab("awaiting_approval")}
            />
          ) : null}

          <section aria-label="Summary metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summaryLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </>
            ) : (
              (() => {
                const currencyEntries = displaySummary
                  ? Object.entries(displaySummary.totalOpenAmountByCurrency ?? {})
                  : [];
                const isMultiCurrency = currencyEntries.length > 1;
                return (
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
                        displaySummary && displaySummary.pendingMyApprovalCount > 0
                          ? "warning"
                          : "neutral"
                      }
                      onClick={() => {
                        setFilters(EMPTY_FILTERS);
                        setTab("awaiting_approval");
                        setShowFilters(false);
                      }}
                    />
                    <MetricCard
                      label="Total open value"
                      icon={<IconTrendingUp size={18} className="text-(--text-muted)" />}
                      tone="neutral"
                      customValue={
                        !displaySummary ? (
                          <p className="text-2xl leading-none font-bold tabular-nums text-(--text-primary)">
                            {dash}
                          </p>
                        ) : isMultiCurrency ? (
                          <MultiCurrencyScroll entries={currencyEntries} />
                        ) : currencyEntries.length === 1 ? (
                          <p className="text-2xl leading-none font-bold tabular-nums text-(--text-primary) mt-auto">
                            {formatAmount(currencyEntries[0]![1], currencyEntries[0]![0])}
                          </p>
                        ) : (
                          <p className="text-2xl leading-none font-bold tabular-nums text-(--text-primary) mt-auto">
                            {dash}
                          </p>
                        )
                      }
                    />
                    <MetricCard
                      label="Overdue"
                      value={displaySummary ? String(displaySummary.overdueCount) : dash}
                      icon={<IconAlertCircle size={18} className="text-(--text-muted)" />}
                      tone={
                        displaySummary && displaySummary.overdueCount > 0 ? "destructive" : "neutral"
                      }
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
                        displaySummary && displaySummary.hasPolicyExceptionCount > 0
                          ? "warning"
                          : "neutral"
                      }
                      onClick={() => {
                        setFilters({ ...EMPTY_FILTERS, policyExceptionOnly: true });
                        setShowFilters(true);
                        setTab(canReadAll ? "all" : "my");
                      }}
                    />
                  </>
                );
              })()
            )}
          </section>
        </>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={handleTabChange}
        className={
          heightConstrained ? "flex min-h-0 flex-1 flex-col" : undefined
        }
      >
        <div
          className={
            heightConstrained
              ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
              : "space-y-3"
          }
        >
          <div
            className="shrink-0 bg-(--bg-main) py-1"
            style={
              compact
                ? {
                    overflowX: "auto",
                    scrollbarWidth: "thin",
                    scrollbarColor: "var(--border-subtle) transparent",
                  }
                : undefined
            }
          >
            <TabsList
              className={
                compact ? "w-max min-w-full !overflow-x-visible scrollbar-none" : undefined
              }
            >
              {tabSpecs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  <span className="flex items-center gap-1.5">
                    {t.label}
                    {t.inboxBadge && pendingBadge != null ? (
                      <span className="rounded-full bg-(--color-warning-soft) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-warning)">
                        {pendingBadge}
                      </span>
                    ) : null}
                    {t.mentionBadge && mentionBadge != null ? (
                      <span className="rounded-full bg-(--color-primary-soft) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-primary)">
                        {mentionBadge}
                      </span>
                    ) : null}
                    {t.sharedBadge && sharedBadge != null ? (
                      <span className="rounded-full bg-(--color-primary-soft) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-primary)">
                        {sharedBadge}
                      </span>
                    ) : null}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div
            className={[
              "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
              "shrink-0 bg-(--bg-main) pb-1",
            ].join(" ")}
          >
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
                className={
                  compact
                    ? "h-8 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-2 text-xs text-(--text-primary) focus:ring-2 focus:ring-(--color-focus-ring) focus:outline-none"
                    : "h-10 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-focus-ring) focus:outline-none"
                }
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div ref={filterContainerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={[
                    `inline-flex ${compact ? "h-8" : "h-10"} cursor-pointer items-center gap-2 rounded-lg border px-3 ${compact ? "text-xs" : "text-sm"} transition-colors`,
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
                {showFilters && (
                  <div
                    className={[
                      "z-[200] mt-1 animate-in fade-in slide-in-from-top-1 duration-150 overflow-y-auto",
                      compact
                        ? "fixed top-auto max-h-[70vh]"
                        : "absolute left-0 top-full w-[min(calc(100vw-2rem),860px)] max-sm:relative max-sm:left-auto max-sm:top-auto max-sm:w-full max-sm:max-h-none",
                    ].join(" ")}
                    style={
                      compact && filterContainerRef.current
                        ? (() => {
                            const isMobileView =
                              typeof window !== "undefined" && window.innerWidth < 640;
                            const rect = filterContainerRef.current.getBoundingClientRect();
                            return isMobileView
                              ? { top: rect.bottom + 4, left: 8, right: 8, width: "auto" }
                              : {
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                  right: "auto",
                                  width: "min(calc(100vw - 24px), 380px)",
                                };
                          })()
                        : compact
                          ? { top: 120, left: 8, right: 8, width: "auto" }
                          : undefined
                    }
                  >
                    <FiltersPanel
                      filters={filters}
                      onChange={setFilters}
                      onClear={() => setFilters(EMPTY_FILTERS)}
                      compact={compact}
                    />
                  </div>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className={`inline-flex ${compact ? "h-8" : "h-10"} cursor-pointer items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 ${compact ? "text-xs" : "text-sm"} text-(--text-secondary) transition-colors hover:border-(--color-danger) hover:bg-(--color-danger-soft) hover:text-(--color-danger)`}
                >
                  <IconX size={13} />
                  Clear filters
                </button>
              )}
            </div>
            {canCreate && !compact && (
              <button
                type="button"
                onClick={() =>
                  openCreateRequestModal({
                    workspaceCurrency: workspaceCurrency ?? "USD",
                    onCreated: handleOptimisticCreate,
                  })
                }
                className="inline-flex h-9 w-auto shrink-0 cursor-pointer items-center gap-2 self-end rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) sm:ml-auto"
              >
                <IconPlus size={15} />
                New request
              </button>
            )}
          </div>

          {heightConstrained ? (
            <ScrollFadeContainer
              className="min-h-0 flex-1 overflow-y-auto pb-4"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "var(--border-subtle) transparent",
              }}
            >
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
                    focusedIndex={focusedIndex}
                    selectedId={selectedId}
                    onNavigate={(id, key) => {
                      try {
                        sessionStorage.setItem(
                          "rlt_request_nav_list",
                          JSON.stringify(records.map((r) => r.id))
                        );
                      } catch {
                        // ignore
                      }
                      if (onNavigateOverride) {
                        onNavigateOverride(id, key);
                      } else {
                        router.push(`/app/requests/${id}`);
                      }
                    }}
                    onClearFilters={clearAllFiltersAndSearch}
                    onNewRequest={
                      canCreate
                        ? () =>
                            openCreateRequestModal({
                              workspaceCurrency: workspaceCurrency ?? "USD",
                              onCreated: handleOptimisticCreate,
                            })
                        : undefined
                    }
                    compact={compact}
                    onMarkMentionRead={handleMarkMentionRead}
                    onMarkSharedRead={handleMarkSharedRead}
                  />
                </TabsContent>
              ))}
            </ScrollFadeContainer>
          ) : (
            <div className="pb-4">
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
                    focusedIndex={focusedIndex}
                    selectedId={selectedId}
                    onNavigate={(id, key) => {
                      try {
                        sessionStorage.setItem(
                          "rlt_request_nav_list",
                          JSON.stringify(records.map((r) => r.id))
                        );
                      } catch {
                        // ignore
                      }
                      if (onNavigateOverride) {
                        onNavigateOverride(id, key);
                      } else {
                        router.push(`/app/requests/${id}`);
                      }
                    }}
                    onClearFilters={clearAllFiltersAndSearch}
                    onNewRequest={
                      canCreate
                        ? () =>
                            openCreateRequestModal({
                              workspaceCurrency: workspaceCurrency ?? "USD",
                              onCreated: handleOptimisticCreate,
                            })
                        : undefined
                    }
                    compact={compact}
                    onMarkMentionRead={handleMarkMentionRead}
                    onMarkSharedRead={handleMarkSharedRead}
                  />
                </TabsContent>
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function ScrollFadeContainer({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      setShowTopFade(scrollTop > 2);
      setShowBottomFade(scrollTop + clientHeight < scrollHeight - 2);
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1 flex flex-col">
      {/* Top fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-6 z-10 transition-opacity duration-200"
        style={{
          opacity: showTopFade ? 1 : 0,
          background: "linear-gradient(to top, transparent, var(--bg-main))",
        }}
      />
      {/* Bottom fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 z-10 transition-opacity duration-200"
        style={{
          opacity: showBottomFade ? 1 : 0,
          background: "linear-gradient(to bottom, transparent, var(--bg-main))",
        }}
      />
      <div
        ref={scrollRef}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>
  );
}

function MultiCurrencyScroll({
  entries,
}: {
  entries: [string, number][];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      setShowTopFade(scrollTop > 2);
      setShowBottomFade(scrollTop + clientHeight < scrollHeight - 2);
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    // Also re-check when entries change (ResizeObserver would be overkill here)
    return () => el.removeEventListener("scroll", update);
  }, [entries]);

  return (
    <div className="relative mt-auto">
      {/* Top fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-4 rounded-t-sm z-10 transition-opacity duration-200"
        style={{
          opacity: showTopFade ? 1 : 0,
          background: "linear-gradient(to top, transparent, var(--bg-surface))",
        }}
      />
      {/* Bottom fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-4 rounded-b-sm z-10 transition-opacity duration-200"
        style={{
          opacity: showBottomFade ? 1 : 0,
          background: "linear-gradient(to bottom, transparent, var(--bg-surface))",
        }}
      />
      <div
        ref={scrollRef}
        className="max-h-[3.75rem] overflow-y-auto space-y-0.5 pr-2"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-subtle) transparent",
        }}
      >
        {entries.map(([code, amount], i) => (
          <div
            key={code}
            className="flex items-baseline justify-between gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
          >
            <span className="text-sm font-bold tabular-nums text-(--text-primary) leading-snug">
              {formatAmount(amount, code)}
            </span>
            <span className="shrink-0 rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 text-[10px] font-semibold text-(--text-muted) tabular-nums tracking-wide">
              {code}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  onClick,
  customValue,
}: {
  label: string;
  value?: string;
  icon: ReactNode;
  tone: "neutral" | "warning" | "destructive";
  onClick?: () => void;
  customValue?: ReactNode;
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
    <div className="flex flex-col gap-2 flex-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-none font-semibold tracking-widest text-(--text-muted) uppercase">
          {label}
        </p>
        <span className={iconColor}>{icon}</span>
      </div>
      {customValue ?? (
        <p className={`text-2xl leading-none font-bold tabular-nums ${valueColor}`}>{value}</p>
      )}
    </div>
  );

  const baseClass = [
    "rounded-xl border border-(--border-subtle) ",
    "bg-(--bg-surface) px-4 py-4 text-left min-h-[5.5rem] flex flex-col justify-between ",
    "transition-all duration-150 ",
    onClick
      ? "cursor-pointer hover:border-(--border-strong) " +
        "hover:bg-(--bg-surface-hover) hover:shadow-sm hover:scale-[1.01]"
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
  compact = false,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(true);

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
    "bg-(--bg-surface) px-3 py-1.5 text-sm h-9 " +
    "text-(--text-primary) " +
    "transition-colors focus:ring-2 focus:ring-(--color-focus-ring) " +
    "focus:outline-none";

  return (
    <div className="overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) shadow-lg">
      <div className="p-2.5">
        <div
          className={
            compact
              ? "grid grid-cols-1 gap-1.5"
              : "grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5"
          }
        >
          <div className="space-y-1">
            <label className="sr-only">Status</label>
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

          <div className="space-y-1">
            <label className="sr-only">Category</label>
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

          <div className="space-y-1">
            <label className="sr-only">Priority</label>
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

          <div className="space-y-1">
            <label className="sr-only">Quick filters</label>
            <div className="flex flex-col gap-1.5">
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
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-(--text-muted) transition-colors hover:text-(--text-primary)"
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
        </div>

        {showAdvanced ? (
          <div className="space-y-3 px-4 pb-4">
            <div
              className={
                compact
                  ? "grid grid-cols-2 gap-2"
                  : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
              }
            >
              <div className="space-y-1">
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
              <div className="space-y-1">
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
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Currency
                </label>
                <SearchableSelect
                  options={[{ value: "", label: "Any currency" }, ...CURRENCY_OPTIONS]}
                  value={filters.currency}
                  onChange={(val) => set("currency", val)}
                  placeholder="Any currency"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Needed by (from)
                </label>
                <Input
                  type="date"
                  value={filters.neededByFrom}
                  onChange={(e) => set("neededByFrom", e.target.value)}
                />
              </div>
              <div className="space-y-1">
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
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Created from
                </label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  Created to
                </label>
                <Input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-(--border-subtle) px-2.5 py-1.5">
        <p className="text-xs text-(--text-muted)">
          {countActiveFilters(filters) > 0
            ? `${countActiveFilters(filters)} filter${countActiveFilters(filters) === 1 ? "" : "s"} active`
            : "No filters active"}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="cursor-pointer text-xs font-semibold text-(--text-muted) transition-colors hover:text-(--color-primary)"
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
  focusedIndex,
  selectedId,
  onNavigate,
  onClearFilters,
  onNewRequest,
  compact: _compact = false,
  onMarkMentionRead,
  onMarkSharedRead,
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
  focusedIndex: number;
  selectedId?: string;
  onNavigate: (id: string, recordKey?: string | null) => void;
  onClearFilters: () => void;
  onNewRequest?: () => void;
  compact?: boolean;
  onMarkMentionRead?: (recordId: string) => void;
  onMarkSharedRead?: (recordId: string) => void;
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
      {records.map((r, idx) => (
        <RecordRow
          key={r.id}
          record={r}
          uiTab={uiTab}
          onClick={() => onNavigate(r.id, r.recordKey ?? null)}
          isFocused={focusedIndex === idx}
          isSelected={selectedId === r.id}
          href={`/app/requests/${r.id}`}
          onMarkMentionRead={onMarkMentionRead}
          onMarkSharedRead={onMarkSharedRead}
        />
      ))}
      {!hasMore && records.length > 0 && (
        <p className="pt-2 text-center text-xs text-(--text-muted)">
          {records.length === 1
            ? "1 request"
            : `${records.length} requests`}
        </p>
      )}
      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-6 text-sm font-medium text-(--text-secondary) transition-all hover:border-(--border-strong) hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-60"
          >
            {loadingMore ? <Spinner size="sm" /> : null}
            {loadingMore ? "Loading…" : "Load more requests"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RecordRow({
  record,
  uiTab,
  onClick,
  isFocused,
  isSelected = false,
  href,
  onMarkMentionRead,
  onMarkSharedRead,
}: {
  record: RecordListItem;
  uiTab: UiTab;
  onClick: () => void;
  isFocused: boolean;
  isSelected?: boolean;
  href: string;
  onMarkMentionRead?: (recordId: string) => void;
  onMarkSharedRead?: (recordId: string) => void;
}) {
  const apiFetch = useApiFetch();
  const [markingRead, setMarkingRead] = useState(false);
  const { amount, currency } = getBestAmount(record);
  const approval = record.approvalStatus;

  const isUnread =
    (uiTab === "awaiting_approval" &&
      approval !== "FULLY_APPROVED" &&
      approval !== "APPROVAL_REJECTED") ||
    (uiTab === "mentioned" && record.hasUnreadMention) ||
    (uiTab === "shared" && record.hasSharedUnviewed);

  const dimmed =
    (uiTab === "mentioned" && !record.hasUnreadMention) ||
    (uiTab === "shared" && !record.hasSharedUnviewed);

  async function handleMarkRead(e: ReactMouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (markingRead) return;
    setMarkingRead(true);
    try {
      const [mentionsRes, accessRes] = await Promise.all([
        apiFetch(`/api/records/${record.id}/mentions`, {
          method: "PATCH",
          showToastOnError: false,
        }),
        apiFetch(`/api/records/${record.id}/access-viewed`, {
          method: "PATCH",
          showToastOnError: false,
        }),
      ]);

      const [mentionsJson, accessJson] = await Promise.all([
        mentionsRes.ok
          ? (mentionsRes.json() as Promise<{ data?: { markedRead?: number } }>).catch(() => null)
          : Promise.resolve(null),
        accessRes.ok
          ? (accessRes.json() as Promise<{ data?: { markedViewed?: number } }>).catch(() => null)
          : Promise.resolve(null),
      ]);

      onMarkMentionRead?.(record.id);
      onMarkSharedRead?.(record.id);

      const mentionDelta = mentionsJson?.data?.markedRead ?? 0;
      const sharedDelta = accessJson?.data?.markedViewed ?? 0;

      if (mentionDelta > 0) {
        window.dispatchEvent(
          new CustomEvent("mentions-marked-read", { detail: { delta: mentionDelta } })
        );
      }
      if (sharedDelta > 0) {
        window.dispatchEvent(
          new CustomEvent("shared-marked-read", { detail: { delta: sharedDelta } })
        );
      }
    } catch {
      /* ignore */
    } finally {
      setMarkingRead(false);
    }
  }

  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.button === 1) return;
        e.preventDefault();
        onClick();
      }}
      className={[
        "group relative block w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-all animate-in fade-in duration-150",
        isSelected
          ? "border-(--color-primary) bg-(--color-primary-soft)"
          : isUnread
            ? "border-(--border-strong) bg-(--bg-surface) hover:border-(--color-primary) hover:shadow-sm"
            : dimmed
              ? "border-(--border-subtle) bg-(--bg-surface) opacity-60 hover:opacity-100 hover:border-(--border-strong)"
              : "border-(--border-subtle) bg-(--bg-surface) hover:border-(--border-strong) hover:bg-(--bg-surface-hover) hover:shadow-sm",
        isFocused ? "ring-2 ring-(--color-primary) ring-offset-1" : "",
        priorityAccentClass(record.priority),
      ].join(" ")}
    >
      {isUnread && !isSelected && (
        <span className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-(--color-primary)" />
      )}

      <div className={`flex items-center justify-between gap-2 ${isUnread ? "pl-2" : ""}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={RECORD_STATUS_BADGE[record.status]} className="shrink-0">
            {RECORD_STATUS_LABELS[record.status]}
          </Badge>
          <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-2 py-0.5 text-[11px] font-medium text-(--text-muted)">
            {RECORD_TYPE_LABELS[record.type]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-(--text-primary)">
            {formatAmount(amount, currency)}
          </span>
          {(uiTab === "mentioned" || uiTab === "shared") &&
            (() => {
              const isAlreadyRead =
                (uiTab === "mentioned" && !record.hasUnreadMention) ||
                (uiTab === "shared" && !record.hasSharedUnviewed);

              const tooltipText = isAlreadyRead
                ? "Viewed"
                : uiTab === "mentioned"
                  ? "Mark mention as viewed"
                  : "Mark as viewed";

              return (
                <div
                  className="relative"
                  onMouseEnter={(e) => {
                    const tip = e.currentTarget.querySelector<HTMLElement>("[data-tooltip]");
                    if (!tip) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const margin = 8;

                    tip.style.opacity = "0";
                    tip.style.position = "fixed";
                    tip.style.bottom = "auto";
                    tip.style.top = "-9999px";
                    tip.style.left = "0px";
                    tip.style.transform = "none";
                    tip.style.zIndex = "9999";
                    tip.style.pointerEvents = "none";

                    const tipRect = tip.getBoundingClientRect();
                    const tipWidth = tipRect.width || 160;

                    let left = rect.left + rect.width / 2;
                    left = Math.max(tipWidth / 2 + margin, Math.min(left, window.innerWidth - tipWidth / 2 - margin));

                    const top = rect.top - tipRect.height - 6;

                    tip.style.top = `${top}px`;
                    tip.style.left = `${left}px`;
                    tip.style.transform = "translateX(-50%)";
                    tip.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    const tip = e.currentTarget.querySelector<HTMLElement>("[data-tooltip]");
                    if (tip) tip.style.opacity = "0";
                  }}
                >
                  <button
                    type="button"
                    onClick={handleMarkRead}
                    disabled={markingRead || isAlreadyRead}
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors",
                      isAlreadyRead
                        ? "cursor-default border-(--border-subtle) bg-(--bg-surface-elev) text-[#4fc3f7]"
                        : "cursor-pointer border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-muted) hover:border-(--color-primary) hover:bg-(--color-primary-soft) hover:text-(--color-primary)",
                    ].join(" ")}
                  >
                    {markingRead ? (
                      <Spinner size="sm" />
                    ) : isAlreadyRead ? (
                      <IconEyeCheck size={12} className="text-[#4fc3f7]" />
                    ) : (
                      <IconEye size={12} />
                    )}
                  </button>

                  <div
                    data-tooltip
                    style={{
                      opacity: 0,
                      pointerEvents: "none",
                      position: "fixed",
                      zIndex: 9999,
                      top: 0,
                      left: 0,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    <div className="relative">
                      <div className="whitespace-nowrap rounded-md bg-(--bg-inverted) px-2.5 py-1.5 text-[11px] font-medium leading-none text-(--text-inverted) shadow-lg">
                        {tooltipText}
                      </div>
                      <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-(--bg-inverted)" />
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>
      </div>

      <div className={`mt-1.5 flex items-center justify-between gap-2 ${isUnread ? "pl-2" : ""}`}>
        <span
          className={[
            "min-w-0 flex-1 text-sm leading-snug transition-colors group-hover:text-(--color-primary)",
            isUnread
              ? "font-semibold text-(--text-primary)"
              : "font-medium text-(--text-primary)",
          ].join(" ")}
        >
          {record.title}
        </span>
        <NeededByLine neededByDate={record.neededByDate} />
      </div>

      <div
        className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs text-(--text-muted) ${isUnread ? "pl-2" : ""}`}
      >
        {record.recordKey ? (
          <span
            role="button"
            tabIndex={0}
            title="Click to copy request ID"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void navigator.clipboard.writeText(record.recordKey!).catch(() => {});
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                void navigator.clipboard.writeText(record.recordKey!).catch(() => {});
              }
            }}
            className="cursor-pointer rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 font-mono text-[11px] text-(--text-secondary) transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-soft) hover:text-(--color-primary)"
          >
            {record.recordKey}
          </span>
        ) : null}
        <span>Created {formatDate(record.createdAt)}</span>
        {approval &&
        approval !== "NOT_STARTED" &&
        approval !== "NO_APPROVERS_ASSIGNED" &&
        APPROVAL_STATUS_BADGE[approval] ? (
          <Badge variant={APPROVAL_STATUS_BADGE[approval]!} className="!px-2 !py-0 text-[10px]">
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
        {record.hasCriticalComment ? (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md bg-(--color-danger-soft) text-xs font-bold text-(--color-danger)"
            aria-label="Action required"
          >
            !
          </span>
        ) : null}
      </div>
    </a>
  );
}

function AttentionBanner({
  pendingApprovalCount,
  onGoToInbox,
}: {
  pendingApprovalCount: number;
  onGoToInbox: () => void;
}) {
  if (pendingApprovalCount === 0) return null;
  return (
    <button
      type="button"
      onClick={onGoToInbox}
      className="group w-full cursor-pointer rounded-xl border border-(--color-warning-soft) bg-(--color-warning-soft) px-4 py-3 text-left transition-all hover:border-(--color-warning) hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-warning) text-sm font-bold text-white">
            {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
          </div>
          <div>
            <p className="text-sm font-semibold text-(--color-warning)">
              {pendingApprovalCount === 1
                ? "1 request needs your approval"
                : `${pendingApprovalCount} requests need your approval`}
            </p>
            <p className="text-xs text-(--text-muted)">
              Click to view your approval inbox
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-(--color-warning) transition-transform group-hover:translate-x-0.5">
          View →
        </span>
      </div>
    </button>
  );
}
