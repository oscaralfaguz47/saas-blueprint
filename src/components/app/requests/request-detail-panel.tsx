"use client";

import Link from "next/link";
import { IconX } from "@/components/ui/icons";
import { RequestDetailClient } from "./request-detail-client";

type Props = {
  recordId: string;
  currentUserId: string;
  permissions: string[];
  onClose: () => void;
  onNavigate?: (id: string) => void;
};

export function RequestDetailPanel({
  recordId,
  currentUserId,
  permissions,
  onClose,
  onNavigate,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Section 1: Panel chrome — Open full page + close — always visible */}
      <div className="flex shrink-0 items-center justify-between border-b border-(--border-subtle) bg-(--bg-surface) px-4 py-2">
        <Link
          href={`/app/requests/${recordId}`}
          prefetch={false}
          className="text-xs font-medium text-(--text-muted) transition-colors hover:text-(--color-primary)"
        >
          Open full page ↗
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
          aria-label="Close detail panel"
        >
          <IconX size={15} />
        </button>
      </div>

      {/* Section 2 + 3: RequestDetailClient fills the rest and manages its own scroll */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <RequestDetailClient
          recordId={recordId}
          currentUserId={currentUserId}
          permissions={permissions}
          onNavigate={onNavigate}
          stickyHeader
        />
      </div>
    </div>
  );
}
