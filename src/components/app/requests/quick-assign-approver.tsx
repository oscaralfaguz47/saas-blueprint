"use client";

import { useEffect, useRef, useState } from "react";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { IconPlus } from "@/components/ui/icons";

type WorkspaceUser = {
  user: { id: string; name: string | null; email: string | null };
};

type Props = {
  recordId: string;
  onSuccess: () => void | Promise<void>;
  /** Already-assigned user ids — these are filtered out from suggestions */
  assignedUserIds?: string[];
  currentUserId: string;
};

/**
 * QuickAssignApprover — inline approver picker, no modal required.
 * Type to search, click or press Enter to assign as APPROVER.
 * Falls back gracefully: if assignment fails, shows inline error.
 */
export function QuickAssignApprover({
  recordId,
  onSuccess,
  assignedUserIds = [],
  currentUserId,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load users once on first open
  useEffect(() => {
    if (!open || users.length > 0) return;
    setLoadingUsers(true);
    apiFetch("/api/tenant/users?context=assignment", { showToastOnError: false })
      .then((r) => r.json())
      .then((json: { data?: { users?: WorkspaceUser[] } }) => {
        setUsers(json.data?.users ?? []);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open, users.length, apiFetch]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setError(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = users
    .filter((u) => u.user.id !== currentUserId)
    .filter((u) => !assignedUserIds.includes(u.user.id))
    .filter((u) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        u.user.name?.toLowerCase().includes(q) ||
        (u.user.email?.toLowerCase().includes(q) ?? false)
      );
    })
    .slice(0, 8);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  async function assign(userId: string) {
    if (assigning) return;
    setAssigning(userId);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, participantRole: "APPROVER" }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { alreadyAssigned?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to assign.");
        return;
      }
      if (json.data?.alreadyAssigned) {
        toast.addToast("success", "Already assigned.");
      } else {
        toast.addToast("success", "Approver assigned.");
      }
      setOpen(false);
      setQuery("");
      await onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAssigning(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[highlightIndex];
      if (target) void assign(target.user.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      setError(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-(--border-strong) px-2.5 text-xs font-medium text-(--text-muted) transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-soft) hover:text-(--color-primary)"
      >
        <IconPlus size={12} />
        Quick assign
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 rounded-lg border border-(--color-primary) bg-(--bg-surface) px-3 py-1.5 ring-2 ring-(--color-primary-soft)">
        <IconPlus size={12} className="shrink-0 text-(--color-primary)" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name or email…"
          className="min-w-0 flex-1 bg-transparent text-sm text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          autoComplete="off"
          spellCheck={false}
        />
        {assigning && <Spinner size="sm" />}
      </div>

      {/* Dropdown */}
      <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-lg">
        {error && (
          <p className="px-3 py-2 text-xs text-(--color-danger)">{error}</p>
        )}
        {loadingUsers ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-(--text-muted)">
            <Spinner size="sm" />
            Loading team members…
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-(--text-muted)">
            {query ? "No members match your search." : "No team members available."}
          </p>
        ) : (
          <ul>
            {filtered.map((u, idx) => {
              const isAssigning = assigning === u.user.id;
              const isHighlighted = idx === highlightIndex;
              const initials = (
                u.user.name ?? u.user.email ?? "?"
              )[0]?.toUpperCase() ?? "?";

              return (
                <li key={u.user.id}>
                  <button
                    type="button"
                    disabled={!!assigning}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => void assign(u.user.id)}
                    className={[
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      isHighlighted
                        ? "bg-(--bg-surface-elev)"
                        : "hover:bg-(--bg-surface-elev)",
                      assigning && !isAssigning ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    {/* Avatar */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-primary-soft) text-xs font-semibold text-(--color-primary)">
                      {isAssigning ? <Spinner size="sm" /> : initials}
                    </div>
                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-(--text-primary)">
                        {u.user.name ?? u.user.email}
                      </p>
                      {u.user.name && u.user.email && (
                        <p className="truncate text-xs text-(--text-muted)">
                          {u.user.email}
                        </p>
                      )}
                    </div>
                    {/* Role hint */}
                    <span className="shrink-0 rounded-md border border-(--border-subtle) px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted)">
                      Approver
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-(--border-subtle) px-3 py-2">
          <p className="text-[10px] text-(--text-muted)">
            ↑↓ navigate · Enter assign · Esc cancel
          </p>
        </div>
      </div>
    </div>
  );
}
