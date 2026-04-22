"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RequestsListClient } from "./requests-list-client";
import { RequestDetailPanel } from "./request-detail-panel";
import type { CreatedRecordPayload } from "./create-request-modal-context";

type Props = {
  canCreate: boolean;
  canReadAll: boolean;
  workspaceCurrency: string;
  currentUserId: string;
  permissions: string[];
};

export function RequestsSplitLayout({
  canCreate,
  canReadAll,
  workspaceCurrency,
  currentUserId,
  permissions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    queueMicrotask(() => setIsMobile(m.matches));
    const listener = () => setIsMobile(m.matches);
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  }, []);

  // Restore selected record from hash on initial page load only
  // (handles bookmarked split-view URLs like /app/requests#recordId)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && hash.length > 0) {
      setSelectedId(hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only — intentionally empty deps

  // Sync selectedId ONLY when navigating directly to /app/requests/[id] via URL
  // (e.g. typing URL in browser, clicking a shared link, or "Back to requests" link)
  // Normal split-view navigation is handled by handleSelectRecord directly.
  useEffect(() => {
    const pathMatch = pathname?.match(/^\/app\/requests\/([^/]+)$/);
    if (pathMatch?.[1]) {
      const idFromUrl = pathMatch[1];
      setSelectedId((prev) => (prev === idFromUrl ? prev : idFromUrl));
    }
    // Intentionally do NOT read window.location.hash here — that would create
    // a second setSelectedId call after handleSelectRecord already set it,
    // causing double-mount of RequestDetailPanel and double API fetches.
  }, [pathname]);

  // Sync selectedId on browser Back/Forward button
  useEffect(() => {
    function handlePopState() {
      const pathMatch = window.location.pathname.match(/^\/app\/requests\/([^/]+)$/);
      if (pathMatch?.[1]) {
        setSelectedId(pathMatch[1]);
      } else {
        const hash = window.location.hash.slice(1);
        setSelectedId(hash || null);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSelectRecord = useCallback(
    (id: string) => {
      if (isMobile) {
        router.push(`/app/requests/${id}`);
        return;
      }
      setSelectedId(id);
      // Use hash to track selected record without triggering Next.js RSC re-fetch
      // Hash changes never cause server component re-renders
      window.history.replaceState(null, "", `/app/requests#${id}`);
    },
    [isMobile, router]
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null);
    window.history.replaceState(null, "", "/app/requests");
  }, []);

  const handleCreated = useCallback(
    (payload: CreatedRecordPayload) => {
      handleSelectRecord(payload.id);
    },
    [handleSelectRecord]
  );

  // On mobile: render only the list (detail is a separate page)
  if (isMobile) {
    return (
      <div className="px-3 py-4">
        <RequestsListClient
          canCreate={canCreate}
          canReadAll={canReadAll}
          workspaceCurrency={workspaceCurrency}
          onNavigate={handleSelectRecord}
          onCreated={handleCreated}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* LEFT — List panel */}
      <div
        className={[
          "flex flex-col overflow-hidden border-r border-(--border-subtle)",
          "transition-all duration-200",
          selectedId
            ? "w-[380px] min-w-[320px] max-w-[420px]"
            : "w-full max-w-[1280px] mx-auto px-4 sm:px-8",
        ].join(" ")}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
          <RequestsListClient
            key="requests-list"
            canCreate={canCreate}
            canReadAll={canReadAll}
            workspaceCurrency={workspaceCurrency}
            onNavigate={handleSelectRecord}
            selectedId={selectedId ?? undefined}
            compact={!!selectedId}
            onCreated={handleCreated}
          />
        </div>
      </div>

      {/* RIGHT — Detail panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedId ? (
          <div className="h-full min-h-0 animate-in fade-in duration-150">
            <RequestDetailPanel
              key={selectedId}
              recordId={selectedId}
              currentUserId={currentUserId}
              permissions={permissions}
              onClose={handleCloseDetail}
              onNavigate={handleSelectRecord}
            />
          </div>
        ) : (
          <div className="hidden h-full w-full animate-in fade-in duration-200 lg:flex lg:items-center lg:justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-(--bg-surface-elev)">
                <span className="text-xl">📋</span>
              </div>
              <p className="text-sm font-medium text-(--text-primary)">Select a request</p>
              <p className="mt-1 text-xs text-(--text-muted)">
                Click any request to view its details here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
