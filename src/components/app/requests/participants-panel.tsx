"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { IconPlus, IconSearch } from "@/components/ui/icons";
import type { RecordParticipant, ParticipantStatus } from "@/types/records";
import type { BadgeVariant } from "@/lib/record-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceUser = {
  membership: { status: string };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type ExternalFormState = {
  name: string;
  expiresInHours: "24" | "72" | "168";
};

type Props = {
  participants: RecordParticipant[];
  recordId: string;
  isClosed: boolean;
  currentUserId: string;
  canAssignInternal: boolean;
  canAssignExternal: boolean;
  canRemind: boolean;
  onRefresh: () => void | Promise<void>;
};

// ─── Status badge map ─────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ParticipantStatus, BadgeVariant> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
}) {
  const initials = (name ?? email ?? "?")[0]?.toUpperCase() ?? "?";
  if (image) {
    return (
      <img
        src={image}
        alt={name ?? email ?? ""}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
        loading="lazy"
        onError={(e) => {
          // Fallback to initials on broken image
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (next) next.style.display = "flex";
        }}
      />
    );
  }
  return (
    <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-(--color-primary-soft) text-xs font-semibold text-(--color-primary)">
      {initials}
    </div>
  );
}

// Avatar with hidden fallback for broken images
function UserAvatarWithFallback({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
}) {
  const initials = (name ?? email ?? "?")[0]?.toUpperCase() ?? "?";
  const [imgFailed, setImgFailed] = useState(false);

  if (image && !imgFailed) {
    return (
      <img
        src={image}
        alt={name ?? email ?? ""}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full bg-(--color-primary-soft) text-xs font-semibold text-(--color-primary)">
      {initials}
    </div>
  );
}

// ─── Participant row ──────────────────────────────────────────────────────────

function ParticipantRow({
  p,
  isBlocking,
  isMyApproval,
  isClosed,
  actionLoading,
  onApprove,
  onReject,
}: {
  p: RecordParticipant;
  isBlocking: boolean;
  isMyApproval: boolean;
  isClosed: boolean;
  actionLoading: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const displayName =
    p.participantType === "INTERNAL"
      ? (p.name ?? p.email ?? "Internal user")
      : (p.name ?? p.email ?? "External approver");

  const subLabel =
    p.participantType === "EXTERNAL" && p.name && p.email ? p.email : null;

  return (
    <li
      className={[
        "relative flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-(--bg-surface-elev) px-3 py-2.5 transition-colors",
        isBlocking
          ? "border-(--color-primary) ring-1 ring-(--color-primary-soft)"
          : "border-(--border-subtle)",
      ].join(" ")}
    >
      {isBlocking && (
        <span className="absolute -left-1 top-2 h-[calc(100%-16px)] w-1 rounded-full bg-(--color-primary)" />
      )}
      <div className="flex min-w-0 items-start gap-2.5 pl-1">
        <UserAvatarWithFallback
          name={p.name}
          email={p.email}
          image={p.image}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-(--text-primary)">
            {displayName}
          </p>
          {subLabel && (
            <p className="truncate text-xs text-(--text-muted)">{subLabel}</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {p.participantType === "EXTERNAL" ? "External" : "Internal"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-(--text-muted)">
            {p.respondedAt
              ? `Responded ${new Date(p.respondedAt).toLocaleDateString()}`
              : "Awaiting response"}
          </p>
          {p.responseReason && (
            <p className="mt-1 text-xs italic text-(--text-secondary)">
              &ldquo;{p.responseReason}&rdquo;
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={STATUS_BADGE[p.status] ?? "default"}>
          {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
        </Badge>
        {p.status === "PENDING" && !isClosed && isMyApproval && (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={actionLoading === p.id}
              onClick={() => onApprove(p.id)}
              className="cursor-pointer rounded bg-(--color-success-soft) px-2 py-1 text-xs font-medium text-(--color-success) transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {actionLoading === p.id ? <Spinner size="sm" /> : "Approve"}
            </button>
            <button
              type="button"
              disabled={actionLoading === p.id}
              onClick={() => onReject(p.id)}
              className="cursor-pointer rounded bg-(--color-danger-soft) px-2 py-1 text-xs font-medium text-(--color-danger) transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Inline external approver form ───────────────────────────────────────────

function ExternalApproverInlineForm({
  recordId,
  email,
  onSuccess,
  onCancel,
}: {
  recordId: string;
  email: string;
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [form, setForm] = useState<ExternalFormState>({ name: "", expiresInHours: "72" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  async function handleAssign() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/participants/external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: form.name.trim() || undefined,
          expiresInHours: Number(form.expiresInHours),
        }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { approvalToken?: string; approvalLinkBase?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to assign external approver.");
        return;
      }
      const base = json.data?.approvalLinkBase;
      const token = json.data?.approvalToken;
      const link = base
        ? new URL(base, window.location.origin).href
        : token
          ? new URL(`/api/v1/external/approvals/${token}`, window.location.origin).href
          : null;
      setCreatedLink(link);
      toast.addToast("success", "External approver assigned.");
      await onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdLink) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 animate-in fade-in duration-150">
        <p className="text-xs font-medium text-(--text-primary)">
          Approval link created — copy and share it:
        </p>
        <p className="break-all rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1.5 font-mono text-[11px] text-(--text-secondary)">
          {createdLink}
        </p>
        <p className="text-[11px] text-(--color-warning)">This link will not be shown again.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(createdLink)}
            className="cursor-pointer rounded-lg bg-(--color-primary) px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg border border-(--border-subtle) px-3 py-1.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 animate-in fade-in duration-150">
      <p className="text-xs font-medium text-(--text-primary)">
        Assign <span className="text-(--color-primary)">{email}</span> as external approver
      </p>
      {error && (
        <p className="rounded bg-(--color-danger-soft) px-2 py-1 text-xs text-(--color-danger)">{error}</p>
      )}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-(--text-muted)">Name (optional)</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Jane Smith"
          disabled={submitting}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-(--text-muted)">Link expires in</label>
        <div className="flex gap-1.5">
          {(["24", "72", "168"] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setForm((f) => ({ ...f, expiresInHours: h }))}
              className={[
                "rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer",
                form.expiresInHours === h
                  ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                  : "border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-surface-hover)",
              ].join(" ")}
            >
              {h === "24" ? "24h" : h === "72" ? "3 days" : "7 days"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleAssign()}
          className="cursor-pointer inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 text-xs font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
        >
          {submitting && <Spinner size="sm" />}
          {submitting ? "Assigning…" : "Assign external approver"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="cursor-pointer inline-flex h-8 items-center rounded-lg border border-(--border-subtle) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Participant search input ─────────────────────────────────────────────────

const DEBOUNCE_MS = 220;

function ParticipantSearchInput({
  recordId,
  role,
  currentUserId,
  assignedUserIds,
  isClosed,
  canAssign,
  canAssignExternal,
  onSuccess,
}: {
  recordId: string;
  role: "APPROVER" | "VIEWER";
  currentUserId: string;
  assignedUserIds: string[];
  isClosed: boolean;
  canAssign: boolean;
  canAssignExternal: boolean;
  onSuccess: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // All users loaded on first focus (or debounced type) — cached for session
  const [allUsers, setAllUsers] = useState<WorkspaceUser[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [externalEmail, setExternalEmail] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    visible: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const fetchUsers = useCallback(() => {
    if (allUsers !== null || loadingUsers) return;
    setLoadingUsers(true);
    void apiFetch("/api/tenant/users?context=assignment", { showToastOnError: false })
      .then((r) => r.json())
      .then((json: { data?: { users?: WorkspaceUser[] } }) => {
        setAllUsers(
          (json.data?.users ?? []).filter(
            (u) => u.membership.status === "ACTIVE" && u.user.id !== currentUserId
          )
        );
      })
      .catch(() => setAllUsers([]))
      .finally(() => setLoadingUsers(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, loadingUsers, currentUserId]);

  const syncUpdatePos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const visible = rect.bottom > 100 && rect.top < viewportHeight - 40;
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      visible,
    });
  }, []);

  // rAF batching for focus-driven updates (after layout)
  const updatePos = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncUpdatePos();
    });
  }, [syncUpdatePos]);

  useEffect(() => {
    if (!open) return;
    syncUpdatePos();
  }, [open, syncUpdatePos]);

  useEffect(() => {
    if (!open) return;

    const scrollableAncestors: Element[] = [];
    let el: Element | null = containerRef.current?.parentElement ?? null;
    while (el) {
      const style = window.getComputedStyle(el);
      const overflow = style.overflow + style.overflowY;
      if (/auto|scroll/.test(overflow)) {
        scrollableAncestors.push(el);
      }
      el = el.parentElement;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    for (const ancestor of scrollableAncestors) {
      ancestor.addEventListener("scroll", syncUpdatePos, { passive: true });
    }
    window.addEventListener("resize", syncUpdatePos, { passive: true });

    return () => {
      for (const ancestor of scrollableAncestors) {
        ancestor.removeEventListener("scroll", syncUpdatePos);
      }
      window.removeEventListener("resize", syncUpdatePos);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [open, syncUpdatePos]);

  // Outside click — close dropdown
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideContainer && !insideDropdown) {
        setOpen(false);
        setQuery("");
        setExternalEmail(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

  const filtered = (allUsers ?? [])
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

  const showExternalOption =
    role === "APPROVER" &&
    canAssignExternal &&
    query.trim().length > 0 &&
    isValidEmail(query) &&
    filtered.length === 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setExternalEmail(null);
    if (!open) setOpen(true);

    // Debounced fetch — only fires once, caches result
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length > 0 && allUsers === null) {
      debounceRef.current = setTimeout(() => {
        fetchUsers();
      }, DEBOUNCE_MS);
    }
  }

  async function assignInternal(userId: string) {
    if (assigning) return;
    setAssigning(userId);
    try {
      const res = await apiFetch(`/api/records/${recordId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, participantRole: role }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { alreadyAssigned?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.addToast("error", json.error?.message ?? "Failed to assign.");
        return;
      }
      toast.addToast(
        "success",
        json.data?.alreadyAssigned
          ? "Already assigned."
          : `${role === "APPROVER" ? "Approver" : "Viewer"} assigned.`
      );
      setOpen(false);
      setQuery("");
      await onSuccess();
    } catch {
      toast.addToast("error", "Network error.");
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
      if (target) void assignInternal(target.user.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      setExternalEmail(null);
    }
  }

  if (!canAssign || isClosed) return null;

  const showDropdown = open && !externalEmail && dropdownPos?.visible;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={[
          "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
          open
            ? "border-(--color-primary) bg-(--bg-surface) ring-2 ring-(--color-primary-soft)"
            : "border-(--border-subtle) bg-(--bg-surface)",
        ].join(" ")}
      >
        <IconSearch size={14} className="shrink-0 text-(--text-muted)" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => {
            setOpen(true);
            updatePos();
            if (allUsers === null && !loadingUsers) {
              fetchUsers();
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            role === "APPROVER"
              ? "Search and assign an approver…"
              : "Search and assign a viewer…"
          }
          className="min-w-0 flex-1 bg-transparent text-sm text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          autoComplete="off"
          spellCheck={false}
        />
        {(assigning || loadingUsers) && <Spinner size="sm" />}
      </div>

      {/* Portal dropdown — fixed positioning, always above all content */}
      {showDropdown &&
        dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
              maxHeight: "320px",
              overflowY: "auto",
              scrollbarWidth: "thin",
            }}
          >
            {loadingUsers ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-(--text-muted)">
                <Spinner size="sm" />
                Loading team members…
              </div>
            ) : filtered.length === 0 && !showExternalOption ? (
              <p className="px-3 py-3 text-xs text-(--text-muted)">
                {query.trim() ? "No members match your search." : "No team members available."}
              </p>
            ) : (
              <ul>
                {filtered.map((u, idx) => {
                  const isHighlighted = idx === highlightIndex;
                  const isAssigning = assigning === u.user.id;
                  return (
                    <li key={u.user.id}>
                      <button
                        type="button"
                        disabled={!!assigning}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        onClick={() => void assignInternal(u.user.id)}
                        className={[
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer",
                          isHighlighted ? "bg-(--bg-surface-elev)" : "hover:bg-(--bg-surface-elev)",
                          assigning && !isAssigning ? "opacity-50" : "",
                        ].join(" ")}
                      >
                        <UserAvatarWithFallback
                          name={u.user.name}
                          email={u.user.email}
                          image={u.user.image}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-(--text-primary)">
                            {u.user.name ?? u.user.email}
                          </p>
                          {u.user.name && u.user.email && (
                            <p className="truncate text-xs text-(--text-muted)">{u.user.email}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-md border border-(--border-subtle) px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted)">
                          {role === "APPROVER" ? "Approver" : "Viewer"}
                        </span>
                        {isAssigning && <Spinner size="sm" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {showExternalOption && (
              <div className={filtered.length > 0 ? "border-t border-(--border-subtle)" : ""}>
                <button
                  type="button"
                  onClick={() => {
                    setExternalEmail(query.trim());
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-(--bg-surface-elev)"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-(--border-strong) text-(--text-muted)">
                    <IconPlus size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-(--text-primary)">
                      Assign external approver
                    </p>
                    <p className="truncate text-xs text-(--text-muted)">{query.trim()}</p>
                  </div>
                </button>
              </div>
            )}

            <div className="border-t border-(--border-subtle) px-3 py-1.5">
              <p className="text-[10px] text-(--text-muted)">
                ↑↓ navigate · Enter assign · Esc close
              </p>
            </div>
          </div>,
          document.body
        )}

      {externalEmail && (
        <ExternalApproverInlineForm
          recordId={recordId}
          email={externalEmail}
          onSuccess={async () => {
            setExternalEmail(null);
            setQuery("");
            await onSuccess();
          }}
          onCancel={() => {
            setExternalEmail(null);
            setQuery("");
          }}
        />
      )}
    </div>
  );
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({
  open,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <h2 className="text-base font-semibold text-(--text-primary)">Reject request</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Provide a reason for rejection (optional).
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason for rejection…"
          className="mt-3 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm text-(--text-primary) outline-none focus:ring-2 focus:ring-(--color-focus-ring) resize-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onConfirm(reason)}
            className="cursor-pointer inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-danger) px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Rejecting…" : "Confirm rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Participant list section ─────────────────────────────────────────────────

function ParticipantListSection({
  title,
  role,
  participants,
  recordId,
  isClosed,
  currentUserId,
  canAssign,
  canAssignExternal,
  canRemind,
  onRefresh,
}: {
  title: string;
  role: "APPROVER" | "VIEWER";
  participants: RecordParticipant[];
  recordId: string;
  isClosed: boolean;
  currentUserId: string;
  canAssign: boolean;
  canAssignExternal: boolean;
  canRemind: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    participantId: string | null;
    submitting: boolean;
  }>({ open: false, participantId: null, submitting: false });

  const roleParticipants = participants.filter((p) => p.participantRole === role);
  const hasPending = roleParticipants.some((p) => p.status === "PENDING");
  const blockingId =
    role === "APPROVER"
      ? roleParticipants.find((p) => p.status === "PENDING")?.id ?? null
      : null;

  const assignedUserIds = roleParticipants
    .filter((p) => p.userId != null)
    .map((p) => p.userId!);

  async function handleApprove(participantId: string) {
    setActionLoading(participantId);
    try {
      const res = await apiFetch(
        `/api/records/${recordId}/participants/${participantId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "APPROVE" }),
          showToastOnError: false,
        }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.addToast("error", json.error?.message ?? "Action failed.");
        return;
      }
      toast.addToast("success", "Approved.");
      await onRefresh();
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectConfirm(reason: string) {
    const participantId = rejectModal.participantId;
    if (!participantId) return;
    setRejectModal((m) => ({ ...m, submitting: true }));
    try {
      const res = await apiFetch(
        `/api/records/${recordId}/participants/${participantId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "REJECT", comment: reason }),
          showToastOnError: false,
        }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.addToast("error", json.error?.message ?? "Rejection failed.");
        return;
      }
      toast.addToast("success", "Rejected.");
      setRejectModal({ open: false, participantId: null, submitting: false });
      await onRefresh();
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setRejectModal((m) => ({ ...m, submitting: false }));
    }
  }

  async function handleRemind() {
    setReminding(true);
    try {
      const res = await apiFetch(`/api/records/${recordId}/remind`, {
        method: "POST",
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.addToast("error", json.error?.message ?? "Failed to send reminders.");
        return;
      }
      toast.addToast("success", "Reminders sent.");
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setReminding(false);
    }
  }

  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
            {title}{" "}
            <span className="font-normal normal-case tracking-normal">
              ({roleParticipants.length})
            </span>
          </p>
          {role === "APPROVER" && canRemind && hasPending && !isClosed && (
            <button
              type="button"
              onClick={() => void handleRemind()}
              disabled={reminding}
              className="cursor-pointer inline-flex h-6 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2 text-[11px] text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
            >
              {reminding ? <Spinner size="sm" /> : null}
              {reminding ? "Sending…" : "Send reminder"}
            </button>
          )}
        </div>

        <ParticipantSearchInput
          recordId={recordId}
          role={role}
          currentUserId={currentUserId}
          assignedUserIds={assignedUserIds}
          isClosed={isClosed}
          canAssign={canAssign}
          canAssignExternal={canAssignExternal}
          onSuccess={onRefresh}
        />

        <div
          className={[
            "mt-2 space-y-2",
            roleParticipants.length > 3 ? "max-h-[13rem] overflow-y-auto pr-1" : "",
          ].join(" ")}
          style={
            roleParticipants.length > 3
              ? { scrollbarWidth: "thin", scrollbarColor: "var(--border-subtle) transparent" }
              : undefined
          }
        >
          {roleParticipants.length === 0 ? (
            <p className="py-2 text-xs text-(--text-muted)">
              {role === "APPROVER" ? "No approvers assigned yet." : "No viewers assigned yet."}
            </p>
          ) : (
            <ul className="space-y-2">
              {roleParticipants.map((p) => (
                <ParticipantRow
                  key={p.id}
                  p={p}
                  isBlocking={p.id === blockingId}
                  isMyApproval={
                    p.participantType === "INTERNAL" &&
                    p.userId === currentUserId &&
                    p.status === "PENDING"
                  }
                  isClosed={isClosed}
                  actionLoading={actionLoading}
                  onApprove={handleApprove}
                  onReject={(id) =>
                    setRejectModal({ open: true, participantId: id, submitting: false })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <RejectModal
        open={rejectModal.open}
        submitting={rejectModal.submitting}
        onClose={() => setRejectModal({ open: false, participantId: null, submitting: false })}
        onConfirm={(reason) => void handleRejectConfirm(reason)}
      />
    </>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export function ParticipantsPanel({
  participants,
  recordId,
  isClosed,
  currentUserId,
  canAssignInternal,
  canAssignExternal,
  canRemind,
  onRefresh,
}: Props) {
  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4">
      <h2 className="mb-4 text-sm font-semibold text-(--text-primary)">
        Shared with{" "}
        <span className="font-normal text-(--text-muted)">({participants.length})</span>
      </h2>

      <div className="space-y-5">
        <ParticipantListSection
          title="Approvers"
          role="APPROVER"
          participants={participants}
          recordId={recordId}
          isClosed={isClosed}
          currentUserId={currentUserId}
          canAssign={canAssignInternal || canAssignExternal}
          canAssignExternal={canAssignExternal}
          canRemind={canRemind}
          onRefresh={onRefresh}
        />

        <div className="border-t border-(--border-subtle)" />

        <ParticipantListSection
          title="Viewers"
          role="VIEWER"
          participants={participants}
          recordId={recordId}
          isClosed={isClosed}
          currentUserId={currentUserId}
          canAssign={canAssignInternal}
          canAssignExternal={false}
          canRemind={false}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
}
