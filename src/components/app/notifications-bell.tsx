"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconBell } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";

type NotificationItem = {
  id: string;
  notificationType: string;
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

type Props = { initialUnreadCount?: number };

function formatNotificationBody(body: string | null): string | null {
  if (!body) return null;
  return body
    .replace(/OPEN/g, "Open")
    .replace(/IN_PROGRESS/g, "In progress")
    .replace(/WAITING_FOR_CUSTOMER/g, "Waiting for customer")
    .replace(/CLOSED/g, "Closed");
}

function formatRelativeTime(iso: string): string {
  const when = new Date(iso).getTime();
  if (Number.isNaN(when)) return "";
  const diffMs = Date.now() - when;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const n = Math.floor(diffMs / minute);
    return `${n} minute${n === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const n = Math.floor(diffMs / hour);
    return `${n} hour${n === 1 ? "" : "s"} ago`;
  }
  const n = Math.floor(diffMs / day);
  return `${n} day${n === 1 ? "" : "s"} ago`;
}

export function NotificationsBell({ initialUnreadCount = 0 }: Props) {
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => {
    apiFetchRef.current = apiFetch;
  }, [apiFetch]);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetchRef.current("/api/app/notifications", { showToastOnError: false });
      if (!res.ok) {
        if (!mountedRef.current) return;
        setError("Could not load notifications.");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as NotificationsResponse;
      if (!mountedRef.current) return;
      setNotifications(json.data.notifications);
      setUnreadCount(json.data.unreadCount);
      setNextCursor(json.data.nextCursor ?? null);
      setHasMore(json.data.nextCursor != null);
      setError(null);
    } catch {
      if (!mountedRef.current) return;
      setError("Could not load notifications.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — apiFetch via stable ref

  useEffect(() => {
    mountedRef.current = true;
    void fetchNotifications();

    let intervalId: number | null = null;

    function startPolling() {
      if (intervalId !== null) return; // already running
      intervalId = window.setInterval(() => {
        // Extra guard: do not fetch if tab became hidden between ticks
        if (document.visibilityState === "visible") {
          void fetchNotifications();
        }
      }, 30_000);
    }

    function stopPolling() {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    }

    // Start or stop polling based on tab visibility
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab became visible — fetch immediately then restart polling
        void fetchNotifications();
        startPolling();
      } else {
        // Tab went to background — pause polling
        stopPolling();
      }
    };

    // Fetch immediately when user switches back to this window
    // (covers OS-level window focus, not just tab switching)
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications();
      }
    };

    // Only start polling if the tab is already visible on mount
    if (document.visibilityState === "visible") {
      startPolling();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchNotifications]);

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
      setHasMore(json.data.nextCursor != null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    if (!open || !sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          void loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [open, hasMore, loadMore, loadingMore]);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  // Adjust dropdown horizontal position to prevent viewport overflow on mobile
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    if (rect.left < 8) {
      // Dropdown overflows left edge — shift it right
      const overflow = 8 - rect.left;
      dropdownRef.current.style.right = `-${overflow}px`;
    } else {
      dropdownRef.current.style.right = "0px";
    }
  }, [open]);

  const badgeText = useMemo(() => {
    if (unreadCount <= 0) return null;
    if (unreadCount >= 10) return "9+";
    return String(unreadCount);
  }, [unreadCount]);

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
    setOpen(false);

    const isReplyNotification =
      n.notificationType === "support.ticket.reply" ||
      n.notificationType === "support.ticket.user_replied";

    const destination = n.actionUrl ?? "/app/help/inbox";

    // support.ticket.reply stores entityId = ticketId.
    // support.ticket.user_replied stores entityId = messageId (idempotency); ticket id is on actionUrl.
    let refreshTicketId: string | null = null;
    if (isReplyNotification) {
      if (n.notificationType === "support.ticket.reply" && n.entityId) {
        refreshTicketId = n.entityId;
      } else if (n.notificationType === "support.ticket.user_replied" && n.actionUrl) {
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
    <div ref={rootRef} className="relative">
      <div className="relative inline-flex">
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer inline-flex h-9 w-9 items-center justify-center rounded-full text-(--text-secondary) transition-colors duration-150 hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
        >
          <IconBell size={18} />
        </button>
        {badgeText ? (
          <span
            className="pointer-events-none absolute select-none flex items-center justify-center rounded-full bg-(--color-danger) text-[10px] font-bold text-white"
            style={{
              top: "-4px",
              right: "-4px",
              minWidth: "16px",
              height: "16px",
              lineHeight: 1,
              padding: "0 3px",
            }}
          >
            {badgeText}
          </span>
        ) : null}
      </div>

      {open ? (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-2 w-[22rem] rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-2 shadow-xl"
          style={{
            minWidth: "280px",
            maxWidth: "calc(100vw - 16px)",
            right: 0,
          }}
        >
          <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 px-2 py-1">
            <p className="text-sm font-semibold text-(--text-primary)">Notifications</p>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markAllPending || unreadCount === 0}
              className="cursor-pointer flex-shrink-0 whitespace-nowrap min-w-0 inline-flex items-center gap-1 text-xs font-medium text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markAllPending ? <Spinner size="sm" /> : null}
              Mark all as read
            </button>
          </div>

          <div className="scrollbar-custom max-h-96 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 px-2 py-1">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : null}

            {!loading && error ? (
              <p className="px-2 py-3 text-sm text-(--text-muted)">{error}</p>
            ) : null}

            {!loading && !error && notifications.length === 0 ? (
              <p className="px-2 py-3 text-sm text-(--text-muted)">No notifications yet</p>
            ) : null}

            {!loading && !error && notifications.length > 0
              ? notifications.map((n) => {
                  const isUnread = !n.readAt;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className="cursor-pointer flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-(--bg-surface-elev)"
                    >
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                          isUnread ? "bg-(--color-primary)" : "bg-(--border-strong)"
                        }`}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-1 block text-sm font-medium text-(--text-primary)">
                          {n.title}
                        </span>
                        {n.body ? (
                          <span className="line-clamp-1 block text-xs text-(--text-secondary)">
                            {formatNotificationBody(n.body)}
                          </span>
                        ) : null}
                        <span className="block text-[11px] text-(--text-muted)">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  );
                })
              : null}
            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center py-2">
                {loadingMore ? <Spinner size="sm" /> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
