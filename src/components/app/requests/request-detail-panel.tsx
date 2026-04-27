"use client";

import Link from "next/link";
import { IconX, IconMaximize } from "@/components/ui/icons";
import { RequestDetailClient, RequestKeyboardNav } from "./request-detail-client";

type Props = {
  recordId: string;
  currentUserId: string;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  permissions: string[];
  onClose: () => void;
  onNavigate?: (id: string, key?: string | null) => void;
  onMentionsRead?: (markedReadCount?: number) => void;
  onSharedViewed?: (count?: number) => void;
};

export function RequestDetailPanel({
  recordId,
  currentUserId,
  currentUserName,
  currentUserEmail,
  permissions,
  onClose,
  onNavigate,
  onMentionsRead,
  onSharedViewed,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Panel chrome */}
      <div className="flex shrink-0 items-center border-b border-(--border-subtle) bg-(--bg-surface) px-3 py-2">
        {/* Left: spacer to balance right side */}
        <div className="w-16 shrink-0" />

        {/* Center: keyboard nav */}
        <div className="flex flex-1 items-center justify-center">
          <RequestKeyboardNav currentId={recordId} onNavigate={onNavigate} />
        </div>

        {/* Right: actions */}
        <div className="flex w-16 shrink-0 items-center justify-end gap-1">
          <Link
            href={`/app/requests/${recordId}`}
            prefetch={false}
            title="Open full page"
            className="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
          >
            <IconMaximize size={14} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
            aria-label="Close detail panel"
          >
            <IconX size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <RequestDetailClient
          recordId={recordId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserEmail={currentUserEmail}
          permissions={permissions}
          onNavigate={onNavigate}
          onMentionsRead={onMentionsRead}
          onSharedViewed={onSharedViewed}
          stickyHeader
        />
      </div>
    </div>
  );
}
