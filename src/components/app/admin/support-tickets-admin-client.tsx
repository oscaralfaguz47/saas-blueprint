"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { CardContent, CardRoot } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useApiFetch } from "@/hooks/use-api-fetch";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_FOR_CUSTOMER" | "CLOSED";
type StatusFilter = "ALL" | TicketStatus;

type Row = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  ticketType: string;
  requesterEmail: string | null;
  lastMessageAt: string;
  createdAt: string;
  tenant: { id: string; name: string; slug: string } | null;
  requester: { id: string; name: string | null; email: string | null } | null;
  assignee: { id: string; name: string | null; email: string | null } | null;
};

type DetailTicket = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  ticketType: string;
  createdAt: string;
  tenant: { id: string; name: string; slug: string } | null;
  requester: { id: string; name: string | null; email: string | null } | null;
  requesterEmail: string | null;
  assignee: { id: string; name: string | null; email: string | null } | null;
};

type DetailMessage = {
  id: string;
  bodyText: string;
  authorKind: "WORKSPACE_USER" | "PLATFORM_ADMIN" | "SYSTEM";
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string | null; email: string | null } | null;
};

type AdminUserOption = { id: string; name?: string; email?: string };
const COMPOSER_MAX = 4000;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_FOR_CUSTOMER", label: "Waiting for customer" },
  { value: "CLOSED", label: "Closed" },
];

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_FOR_CUSTOMER", "CLOSED"],
  IN_PROGRESS: ["WAITING_FOR_CUSTOMER", "CLOSED"],
  WAITING_FOR_CUSTOMER: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function formatDate(dateLike: string): string {
  return new Date(dateLike).toLocaleString();
}

export function SupportTicketsAdminClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  const toast = useToast();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [queryInput, setQueryInput] = useState("");
  const [queryDebounced, setQueryDebounced] = useState("");

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<DetailTicket | null>(null);
  const [detailMessages, setDetailMessages] = useState<DetailMessage[]>([]);

  const [activeComposer, setActiveComposer] = useState<"reply" | "note">("reply");
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const [notePending, setNotePending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [reopenPending, setReopenPending] = useState(false);
  const [assigneePending, setAssigneePending] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeOptions, setAssigneeOptions] = useState<AdminUserOption[]>([]);
  const [assigneeSearchPending, setAssigneeSearchPending] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldRefocusReplyRef = useRef(false);
  const shouldRefocusNoteRef = useRef(false);
  const adminMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Row[]>([]);

  useEffect(() => {
    apiFetchRef.current = apiFetch;
  }, [apiFetch]);

  const selectedTicketId = searchParams.get("ticketId");

  const setTicketIdInUrl = useCallback(
    (ticketId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (ticketId) {
        next.set("ticketId", ticketId);
      } else {
        next.delete("ticketId");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDebounced(queryInput), 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const loadList = useCallback(
    async (opts?: { keepLoading?: boolean }) => {
      if (!opts?.keepLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (statusFilter !== "ALL") {
          params.set("status", statusFilter);
        }
        if (queryDebounced.trim()) {
          params.set("q", queryDebounced.trim());
        }
        const res = await apiFetchRef.current(`/api/admin/support/tickets?${params.toString()}`);
        if (!res.ok) {
          setError("Failed to load tickets");
          return;
        }
        const json = (await res.json()) as { data: { items: Row[] } };
        setItems(json.data?.items ?? []);
      } catch {
        setError("Failed to load tickets");
      } finally {
        if (!opts?.keepLoading) {
          setLoading(false);
        }
      }
    },
    [queryDebounced, statusFilter],
  );

  const loadDetail = useCallback(
    async (ticketId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await apiFetchRef.current(`/api/admin/support/tickets/${ticketId}`);
        if (!res.ok) {
          setDetailTicket(null);
          setDetailMessages([]);
          setDetailError("Failed to load ticket details.");
          return;
        }
        const json = (await res.json()) as {
          data: {
            ticket: DetailTicket;
            messages: DetailMessage[];
          };
        };
        setDetailTicket(json.data.ticket);
        setDetailMessages(json.data.messages ?? []);
      } catch {
        setDetailTicket(null);
        setDetailMessages([]);
        setDetailError("Failed to load ticket details.");
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!selectedTicketId) {
      setDetailTicket(null);
      setDetailMessages([]);
      setDetailError(null);
      setReplyText("");
      setNoteText("");
      return;
    }
    // Use ref to avoid re-firing when items update (e.g. after optimistic reply).
    // items intentionally excluded from deps — use itemsRef.
    const selectedRow = itemsRef.current.find((r) => r.id === selectedTicketId);
    if (selectedRow?.ticketType === "SALES_INQUIRY") {
      setActiveComposer("note");
    } else {
      setActiveComposer("reply");
    }
    void loadDetail(selectedTicketId);
  }, [loadDetail, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId || assigneeSearch.trim().length < 2) {
      setAssigneeOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAssigneeSearchPending(true);
      try {
        const q = encodeURIComponent(assigneeSearch.trim());
        const res = await apiFetchRef.current(`/api/admin/users/search?q=${q}&limit=10&platformAdminsOnly=true`);
        if (!res.ok) {
          if (!cancelled) setAssigneeOptions([]);
          return;
        }
        const json = (await res.json()) as { data: { items: AdminUserOption[] } };
        if (!cancelled) setAssigneeOptions(json.data?.items ?? []);
      } catch {
        if (!cancelled) setAssigneeOptions([]);
      } finally {
        if (!cancelled) setAssigneeSearchPending(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assigneeSearch, selectedTicketId]);

  const validNextStatuses = useMemo(
    () => (detailTicket ? TRANSITIONS[detailTicket.status] : []),
    [detailTicket],
  );

  const updateListItem = useCallback((ticketId: string, updater: (row: Row) => Row) => {
    setItems((prev) => prev.map((row) => (row.id === ticketId ? updater(row) : row)));
  }, []);

  const scrollAdminMessagesToBottom = useCallback(() => {
    window.setTimeout(() => {
      adminMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  useEffect(() => {
    if (detailMessages.length > 0) {
      scrollAdminMessagesToBottom();
    }
  }, [detailMessages, scrollAdminMessagesToBottom]);

  useEffect(() => {
    const handleTicketRefresh = (e: Event) => {
      const detail = (e as CustomEvent<{ ticketId: string }>).detail;
      if (detail?.ticketId && detail.ticketId === selectedTicketId) {
        void loadDetail(selectedTicketId);
      }
    };
    window.addEventListener("relitrue:ticket-refresh", handleTicketRefresh);
    return () => {
      window.removeEventListener("relitrue:ticket-refresh", handleTicketRefresh);
    };
  }, [loadDetail, selectedTicketId]);

  useEffect(() => {
    setReplyText("");
    setNoteText("");
    const timer = window.setTimeout(() => {
      if (activeComposer === "reply") {
        replyTextareaRef.current?.focus();
      } else {
        noteTextareaRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeComposer]);

  useEffect(() => {
    if (!replyPending && shouldRefocusReplyRef.current) {
      shouldRefocusReplyRef.current = false;
      window.setTimeout(() => replyTextareaRef.current?.focus(), 0);
    }
  }, [replyPending]);

  useEffect(() => {
    if (!notePending && shouldRefocusNoteRef.current) {
      shouldRefocusNoteRef.current = false;
      window.setTimeout(() => noteTextareaRef.current?.focus(), 0);
    }
  }, [notePending]);

  const handleReplyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!replyPending && replyText.trim() && replyText.length <= COMPOSER_MAX) {
          void handleSendReply();
        }
      }
    },
    [replyPending, replyText],
  );

  const handleNoteKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!notePending && noteText.trim() && noteText.length <= COMPOSER_MAX) {
          void handleAddNote();
        }
      }
    },
    [notePending, noteText],
  );

  const handleSendReply = useCallback(async () => {
    if (!selectedTicketId || !detailTicket || !replyText.trim() || replyText.length > COMPOSER_MAX) return;
    const messageText = replyText.trim();
    const prevStatus = detailTicket.status;
    const nextStatus =
      prevStatus === "OPEN" || prevStatus === "IN_PROGRESS" ? "WAITING_FOR_CUSTOMER" : prevStatus;
    const nowIso = new Date().toISOString();
    const tempId = `tmp-reply-${Date.now()}`;
    setReplyPending(true);
    setDetailMessages((prev) => [
      ...prev,
      {
        id: tempId,
        bodyText: messageText,
        authorKind: "PLATFORM_ADMIN",
        isInternal: false,
        createdAt: nowIso,
        author: null,
      },
    ]);
    setDetailTicket((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    updateListItem(selectedTicketId, (row) => ({ ...row, status: nextStatus, lastMessageAt: nowIso }));
    try {
      const res = await apiFetchRef.current(`/api/admin/support/tickets/${selectedTicketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });
      if (!res.ok) {
        setDetailMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDetailTicket((prev) => (prev ? { ...prev, status: prevStatus } : prev));
        updateListItem(selectedTicketId, (row) => ({ ...row, status: prevStatus }));
        toast.addToast("error", "Failed to send reply.");
        return;
      }
      const json = (await res.json()) as { data?: { messageId?: string } };
      const serverId = json.data?.messageId;
      if (serverId) {
        setDetailMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: serverId } : m)));
      }
      toast.addToast("success", "Reply sent.");
      setReplyText("");
      shouldRefocusReplyRef.current = true;
    } finally {
      setReplyPending(false);
    }
  }, [detailTicket, replyText, selectedTicketId, toast, updateListItem]);

  const handleAddNote = useCallback(async () => {
    if (!selectedTicketId || !noteText.trim() || noteText.length > COMPOSER_MAX) return;
    const messageText = noteText.trim();
    const nowIso = new Date().toISOString();
    const tempId = `tmp-note-${Date.now()}`;
    setNotePending(true);
    setDetailMessages((prev) => [
      ...prev,
      {
        id: tempId,
        bodyText: messageText,
        authorKind: "PLATFORM_ADMIN",
        isInternal: true,
        createdAt: nowIso,
        author: null,
      },
    ]);
    updateListItem(selectedTicketId, (row) => ({ ...row, lastMessageAt: nowIso }));
    try {
      const res = await apiFetchRef.current(`/api/admin/support/tickets/${selectedTicketId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });
      if (!res.ok) {
        setDetailMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast.addToast("error", "Failed to add internal note.");
        return;
      }
      const json = (await res.json()) as { data?: { messageId?: string } };
      const serverId = json.data?.messageId;
      if (serverId) {
        setDetailMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: serverId } : m)));
      }
      toast.addToast("success", "Internal note added.");
      setNoteText("");
      shouldRefocusNoteRef.current = true;
    } finally {
      setNotePending(false);
    }
  }, [noteText, selectedTicketId, toast, updateListItem]);

  const handleStatusChange = useCallback(
    async (nextStatus: TicketStatus) => {
      if (!selectedTicketId || !detailTicket) return;
      const prevStatus = detailTicket.status;
      if (prevStatus === nextStatus) return;
      setStatusPending(true);
      setDetailTicket((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      updateListItem(selectedTicketId, (row) => ({ ...row, status: nextStatus }));
      try {
        const res = await apiFetchRef.current(`/api/admin/support/tickets/${selectedTicketId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) {
          setDetailTicket((prev) => (prev ? { ...prev, status: prevStatus } : prev));
          updateListItem(selectedTicketId, (row) => ({ ...row, status: prevStatus }));
          toast.addToast("error", "Failed to update status.");
          return;
        }
        toast.addToast("success", "Ticket status updated.");
      } finally {
        setStatusPending(false);
      }
    },
    [detailTicket, selectedTicketId, toast, updateListItem],
  );

  const handleReopen = useCallback(async () => {
    if (!selectedTicketId || !detailTicket) return;
    const prevStatus = detailTicket.status;
    const tempId = `tmp-system-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setReopenPending(true);
    setDetailTicket((prev) => (prev ? { ...prev, status: "OPEN" } : prev));
    setDetailMessages((prev) => [
      ...prev,
      {
        id: tempId,
        bodyText: "Ticket reopened.",
        authorKind: "SYSTEM",
        isInternal: false,
        createdAt: nowIso,
        author: null,
      },
    ]);
    updateListItem(selectedTicketId, (row) => ({ ...row, status: "OPEN", lastMessageAt: nowIso }));
    try {
      const res = await apiFetchRef.current(`/api/admin/support/tickets/${selectedTicketId}/reopen`, {
        method: "POST",
      });
      if (!res.ok) {
        setDetailTicket((prev) => (prev ? { ...prev, status: prevStatus } : prev));
        setDetailMessages((prev) => prev.filter((m) => m.id !== tempId));
        updateListItem(selectedTicketId, (row) => ({ ...row, status: prevStatus }));
        toast.addToast("error", "Failed to reopen ticket.");
        return;
      }
      toast.addToast("success", "Ticket reopened.");
    } finally {
      setReopenPending(false);
    }
  }, [detailTicket, selectedTicketId, toast, updateListItem]);

  const handleAssign = useCallback(
    async (assigneeUserId: string | null) => {
      if (!selectedTicketId || !detailTicket) return;
      const prevAssignee = detailTicket.assignee;
      const nextAssignee =
        assigneeUserId == null
          ? null
          : (() => {
              const found = assigneeOptions.find((u) => u.id === assigneeUserId);
              return {
                id: assigneeUserId,
                name: found?.name ?? null,
                email: found?.email ?? null,
              };
            })();
      setAssigneePending(true);
      setDetailTicket((prev) => (prev ? { ...prev, assignee: nextAssignee } : prev));
      updateListItem(selectedTicketId, (row) => ({ ...row, assignee: nextAssignee }));
      try {
        const res = await apiFetchRef.current(`/api/admin/support/tickets/${selectedTicketId}/assignee`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigneeUserId }),
        });
        if (!res.ok) {
          setDetailTicket((prev) => (prev ? { ...prev, assignee: prevAssignee } : prev));
          updateListItem(selectedTicketId, (row) => ({ ...row, assignee: prevAssignee }));
          toast.addToast("error", "Failed to update assignee.");
          return;
        }
        toast.addToast("success", assigneeUserId ? "Assignee updated." : "Assignee removed.");
      } finally {
        setAssigneePending(false);
      }
    },
    [assigneeOptions, detailTicket, selectedTicketId, toast, updateListItem],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="md" />
        <p className="text-sm text-(--text-muted)">Loading tickets…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
        <p className="text-sm text-(--color-danger)">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className={selectedTicketId ? "hidden min-w-0 lg:block lg:w-[42%]" : "min-w-0 lg:w-[42%]"}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-10 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search by subject or requester email"
          />
        </div>

        {items.length === 0 ? (
          <EmptyState title="No tickets" description="There are no support tickets to display." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
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
                  <TableRow key={t.id} className={selectedTicketId === t.id ? "bg-(--nav-active)/40" : ""}>
                    <TableCell className="max-w-[240px] truncate font-medium">
                      <button
                        type="button"
                        onClick={() => setTicketIdInUrl(t.id)}
                        className="truncate text-left text-primary hover:underline"
                      >
                        {t.subject}
                      </button>
                    </TableCell>
                    <TableCell className="text-(--text-muted) text-xs">
                      {t.ticketType === "SALES_INQUIRY" ? "Sales" : "Support"}
                    </TableCell>
                    <TableCell>
                      {t.tenant ? (
                        <Link
                          className="text-primary hover:underline"
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
                    <TableCell>{formatStatus(t.status)}</TableCell>
                    <TableCell>{t.priority}</TableCell>
                    <TableCell className="text-(--text-muted)">{t.assignee?.email ?? "—"}</TableCell>
                    <TableCell className="text-(--text-muted)">{formatDate(t.lastMessageAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className={selectedTicketId ? "min-w-0 flex-1" : "hidden lg:block lg:min-w-0 lg:flex-1"}>
        {!selectedTicketId ? (
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-6">
            <p className="text-sm text-(--text-muted)">Select a ticket to view details.</p>
          </div>
        ) : detailLoading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev)">
            <Spinner size="md" />
            <p className="text-sm text-(--text-muted)">Loading ticket details...</p>
          </div>
        ) : detailError || !detailTicket ? (
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
            <p className="text-sm text-(--color-danger)">{detailError ?? "Ticket not found."}</p>
            <button
              type="button"
              onClick={() => setTicketIdInUrl(null)}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Close panel
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <CardRoot>
              <CardContent className="p-4">
                {/* Row 1: Subject + close button */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-(--text-primary) leading-tight">
                      {detailTicket.subject}
                    </h3>
                    <p className="mt-0.5 text-xs text-(--text-muted)">
                      Created {formatDate(detailTicket.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTicketIdInUrl(null)}
                    className="shrink-0 rounded px-2 text-lg leading-none text-(--text-muted) hover:bg-(--nav-hover) hover:text-(--text-primary)"
                    aria-label="Close ticket panel"
                  >
                    X
                  </button>
                </div>

                {/* Row 2: Badges */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">{formatStatus(detailTicket.status)}</Badge>
                  <Badge variant="secondary">{detailTicket.priority}</Badge>
                </div>

                {/* Row 3: Meta + controls in two columns */}
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Left column: ticket meta */}
                  <div className="space-y-1 text-sm text-(--text-secondary)">
                    <p>
                      <span className="text-(--text-muted)">Workspace:</span>{" "}
                      {detailTicket.tenant ? (
                        <Link className="text-primary hover:underline" href={`/admin/workspaces/${detailTicket.tenant.id}`}>
                          {detailTicket.tenant.name}
                        </Link>
                      ) : "—"}
                    </p>
                    <p>
                      <span className="text-(--text-muted)">Requester:</span>{" "}
                      {detailTicket.requester?.email ?? detailTicket.requesterEmail ?? "—"}
                    </p>
                    <p>
                      <span className="text-(--text-muted)">Assignee:</span>{" "}
                      {detailTicket.assignee?.email ?? "Unassigned"}
                    </p>
                  </div>

                  {/* Right column: assignee search + status controls */}
                  <div className="space-y-3">
                    {/* Assignee search */}
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                        Assignee
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={assigneeSearch}
                          onChange={(e) => setAssigneeSearch(e.target.value)}
                          placeholder="Search by email/name"
                          className="min-w-0 flex-1 text-sm"
                        />
                        <button
                          type="button"
                          disabled={assigneePending}
                          onClick={() => void handleAssign(null)}
                          className="h-9 shrink-0 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary) hover:bg-(--nav-hover) disabled:opacity-60"
                        >
                          {assigneePending ? "..." : "Unassign"}
                        </button>
                      </div>
                      {assigneeSearchPending ? (
                        <p className="mt-1.5 text-xs text-(--text-muted)">Searching...</p>
                      ) : assigneeOptions.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {assigneeOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={assigneePending}
                              onClick={() => void handleAssign(opt.id)}
                              className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) hover:bg-(--nav-hover) disabled:opacity-60"
                            >
                              {opt.email ?? opt.name ?? opt.id}
                            </button>
                          ))}
                        </div>
                      ) : assigneeSearch.trim().length >= 2 ? (
                        <p className="mt-1.5 text-xs text-(--text-muted)">No users found.</p>
                      ) : null}
                    </div>

                    {/* Status controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        disabled={statusPending || detailTicket.status === "CLOSED"}
                        defaultValue=""
                        onChange={(e) => {
                          const next = e.target.value as TicketStatus;
                          if (next) void handleStatusChange(next);
                          e.currentTarget.value = "";
                        }}
                        className="h-9 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary) disabled:opacity-60"
                      >
                        <option value="">Change status...</option>
                        {validNextStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatStatus(status)}
                          </option>
                        ))}
                      </select>
                      {detailTicket.status === "CLOSED" ? (
                        <button
                          type="button"
                          disabled={reopenPending}
                          onClick={() => void handleReopen()}
                          className="h-9 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--nav-hover) disabled:opacity-60"
                        >
                          {reopenPending ? "Reopening..." : "Reopen"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </CardRoot>

            <CardRoot>
              <CardContent className="space-y-3 p-4">
                <h4 className="font-semibold text-(--text-primary)">Conversation</h4>
                {detailMessages.length === 0 ? (
                  <EmptyState title="No messages" description="This ticket has no messages yet." />
                ) : (
                  <div
                    className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev)/55 p-3 pr-2"
                    style={{
                      maxHeight: "45vh",
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      scrollbarWidth: "thin",
                      scrollbarColor: "var(--border-strong) transparent",
                    }}
                  >
                    {detailMessages.map((msg) => {
                      if (msg.authorKind === "SYSTEM") {
                        return (
                          <div key={msg.id} className="text-center">
                            <p className="text-xs italic text-(--text-muted)">{msg.bodyText}</p>
                            <p className="mt-1 text-[11px] text-(--text-muted)">{formatDate(msg.createdAt)}</p>
                          </div>
                        );
                      }
                      const admin = msg.authorKind === "PLATFORM_ADMIN";
                      return (
                        <div key={msg.id} className={admin ? "flex justify-end" : "flex justify-start"}>
                          <div
                            className={`w-full max-w-[85%] rounded-lg border p-3 ${
                              msg.isInternal
                                ? "border-amber-400/40 bg-amber-400/15"
                                : "border-(--border-subtle) bg-(--bg-surface-elev)"
                            }`}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-(--text-primary)">
                                {msg.author?.name ?? msg.author?.email ?? (admin ? "Platform admin" : "Workspace user")}
                              </span>
                              {msg.isInternal ? (
                                <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-100">
                                  Internal note · not visible to customer
                                </span>
                              ) : null}
                              <span className="text-(--text-muted)">{formatDate(msg.createdAt)}</span>
                            </div>
                            <p className={`whitespace-pre-wrap text-sm ${msg.isInternal ? "text-amber-950 dark:text-amber-50" : "text-(--text-primary)"}`}>{msg.bodyText}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={adminMessagesEndRef} />
                  </div>
                )}
              </CardContent>
            </CardRoot>

            <CardRoot>
              <CardContent className="space-y-3 p-4">
                <div className="flex gap-2">
                  {detailTicket.ticketType !== "SALES_INQUIRY" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyText("");
                        setNoteText("");
                        setActiveComposer("reply");
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        activeComposer === "reply"
                          ? "bg-(--nav-active) text-(--text-primary)"
                          : "bg-(--bg-surface-elev) text-(--text-muted)"
                      }`}
                    >
                      Reply to customer
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setReplyText("");
                      setNoteText("");
                      setActiveComposer("note");
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      activeComposer === "note"
                        ? "bg-(--nav-active) text-(--text-primary)"
                        : "bg-(--bg-surface-elev) text-(--text-muted)"
                    }`}
                  >
                    Internal note
                  </button>
                </div>

                {activeComposer === "reply" && detailTicket.ticketType !== "SALES_INQUIRY" ? (
                  <div className="space-y-2">
                    <textarea
                      ref={replyTextareaRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      rows={4}
                      maxLength={COMPOSER_MAX}
                      disabled={replyPending}
                      className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-focus-ring"
                      placeholder="Write a reply visible to the customer..."
                    />
                    <div className="flex items-center justify-between text-[11px] text-(--text-muted)">
                      <span>Press Enter to send · Shift+Enter for new line</span>
                      <span>{replyText.length} / {COMPOSER_MAX}</span>
                    </div>
                    <button
                      type="button"
                      disabled={replyPending || !replyText.trim() || replyText.length > COMPOSER_MAX}
                      onClick={() => void handleSendReply()}
                      className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {replyPending ? "Sending..." : "Send reply"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                      Internal note · not visible to customer
                    </p>
                    <textarea
                      ref={noteTextareaRef}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={handleNoteKeyDown}
                      rows={4}
                      maxLength={COMPOSER_MAX}
                      disabled={notePending}
                      className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-focus-ring"
                      placeholder="Write an internal note for admins..."
                    />
                    <div className="flex items-center justify-between text-[11px] text-(--text-muted)">
                      <span>Press Enter to send · Shift+Enter for new line</span>
                      <span>{noteText.length} / {COMPOSER_MAX}</span>
                    </div>
                    <button
                      type="button"
                      disabled={notePending || !noteText.trim() || noteText.length > COMPOSER_MAX}
                      onClick={() => void handleAddNote()}
                      className="h-10 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--nav-hover) disabled:opacity-60"
                    >
                      {notePending ? "Adding..." : "Add note"}
                    </button>
                  </div>
                )}
              </CardContent>
            </CardRoot>
          </div>
        )}
      </div>
    </div>
  );
}
