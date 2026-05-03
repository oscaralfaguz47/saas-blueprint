"use client";
/* TD-D8-004: filters apply to loaded rows only. TD-D8-001/002: emitters = backend. */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { formatNotificationBody, formatRelativeTime } from "@/lib/notifications-format";
import { NotificationType } from "@/lib/notification-type-constants";

type NotificationItem = {
  id: string;
  notificationType: string;
  category: string;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  data: {
    unreadCount: number;
    notifications: NotificationItem[];
    nextCursor: string | null;
  };
};

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary";
const CATEGORY_META: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  SECURITY: { label: "Security", variant: "destructive" },
  BILLING: { label: "Billing", variant: "warning" },
  WORKFLOW: { label: "Workflow", variant: "default" },
  FINANCE: { label: "Finance", variant: "success" },
  SOCIAL: { label: "Social", variant: "secondary" },
};

export function NotificationsInboxClient() {
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => {
    apiFetchRef.current = apiFetch;
  }, [apiFetch]);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (categoryFilter && n.category !== categoryFilter) return false;
      if (readFilter === "unread" && n.readAt) return false;
      if (readFilter === "read" && !n.readAt) return false;
      return true;
    });
  }, [notifications, categoryFilter, readFilter]);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchRef.current("/api/app/notifications", { showToastOnError: false });
      if (!res.ok) {
        setError("Could not load notifications.");
        return;
      }
      const json = (await res.json()) as NotificationsResponse;
      setNotifications(json.data.notifications);
      setUnreadCount(json.data.unreadCount);
      setNextCursor(json.data.nextCursor ?? null);
    } catch {
      setError("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiFetchRef.current(
        `/api/app/notifications?cursor=${encodeURIComponent(nextCursor)}&limit=20`,
        { showToastOnError: false }
      );
      if (!res.ok) return;
      const json = (await res.json()) as NotificationsResponse;
      setNotifications((prev) => [...prev, ...json.data.notifications]);
      setNextCursor(json.data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.readAt) {
      setNotifications((curr) =>
        curr.map((item) => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item))
      );
      setUnreadCount((curr) => Math.max(0, curr - 1));
      void apiFetchRef.current(`/api/app/notifications/${n.id}`, {
        method: "PATCH",
        showToastOnError: false,
      });
    }

    const isReplyNotification =
      n.notificationType === NotificationType.SUPPORT_TICKET_REPLY ||
      n.notificationType === NotificationType.SUPPORT_TICKET_USER_REPLIED;

    const destination = n.actionUrl ?? "/app/help/inbox";

    let refreshTicketId: string | null = null;
    if (isReplyNotification) {
      if (n.notificationType === NotificationType.SUPPORT_TICKET_REPLY && n.entityId) {
        refreshTicketId = n.entityId;
      } else if (
        n.notificationType === NotificationType.SUPPORT_TICKET_USER_REPLIED &&
        n.actionUrl
      ) {
        try {
          refreshTicketId = new URL(n.actionUrl, window.location.origin).searchParams.get("ticketId");
        } catch {
          refreshTicketId = null;
        }
      }
    }
    if (refreshTicketId) {
      window.dispatchEvent(
        new CustomEvent("relitrue:ticket-refresh", {
          detail: { ticketId: refreshTicketId },
        })
      );
    }

    router.push(destination);
  };

  const handleMarkAllRead = async () => {
    setMarkAllPending(true);
    const now = new Date().toISOString();
    setNotifications((curr) => curr.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnreadCount(0);
    try {
      await apiFetchRef.current("/api/app/notifications/read-all", {
        method: "POST",
        showToastOnError: false,
      });
    } finally {
      setMarkAllPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="notif-filter-category" className="sr-only">Category</label>
          <select
            id="notif-filter-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 min-w-[10rem] rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map((v) => (
              <option key={v} value={v}>
                {CATEGORY_META[v].label}
              </option>
            ))}
          </select>
          <label htmlFor="notif-filter-read" className="sr-only">Read status</label>
          <select
            id="notif-filter-read"
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as "all" | "unread" | "read")}
            className="h-9 min-w-[10rem] rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </select>
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={markAllPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-(--border-subtle) px-4 text-sm font-medium text-(--color-primary) transition-colors hover:bg-(--color-primary-soft) disabled:opacity-50"
          >
            {markAllPending ? <Spinner size="sm" /> : null}
            Mark all as read
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-6 text-center">
          <p className="text-sm text-(--color-danger)">{error}</p>
          <button
            type="button"
            onClick={() => void fetchInitial()}
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Retry
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <p className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-8 text-center text-sm text-(--text-muted)">
          You have no notifications.
        </p>
      ) : filteredNotifications.length === 0 ? (
        <p className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-8 text-center text-sm text-(--text-muted)">
          No notifications match your filters.
        </p>
      ) : null}

      {!loading && !error && notifications.length > 0 && filteredNotifications.length > 0 ? (
        <ul className="divide-y divide-(--border-subtle) rounded-xl border border-(--border-subtle) bg-(--bg-surface)">
          {filteredNotifications.map((n) => {
            const isUnread = !n.readAt;
            const meta = CATEGORY_META[n.category];
            const catLabel = meta?.label ?? n.category;
            const badgeVariant = meta?.variant ?? "secondary";
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-(--bg-surface-elev)"
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      isUnread ? "bg-(--color-primary)" : "bg-(--border-strong)"
                    }`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-(--text-primary)">{n.title}</span>
                      <Badge variant={badgeVariant}>{catLabel}</Badge>
                    </span>
                    {n.body ? (
                      <span className="text-xs text-(--text-secondary)">
                        {formatNotificationBody(n.body)}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-(--text-muted)">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && !error && notifications.length > 0 && nextCursor ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-(--border-subtle) px-6 text-sm font-medium text-(--text-primary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            {loadingMore ? <Spinner size="sm" /> : null}
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
