"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  IconPlus,
  IconSearch,
  IconSend,
  IconX,
  IconCheckCircleFilled,
  IconXCircleFilled,
  IconHourglass,
  IconEye,
  IconEyeOff,
} from "@/components/ui/icons";
import type { RecordParticipant } from "@/types/records";

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
  isRequestCreator: boolean;
  onRefresh: () => void | Promise<void>;
  /** Called after approve/reject succeeds and onRefresh completes (split-view list/badge updates) */
  onApprovalCompleted?: () => void;
  onParticipantsChange?: (updater: (prev: RecordParticipant[]) => RecordParticipant[]) => void;
};

function IconExternalUser({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a6 6 0 0 1 9.29-5" />
      <path d="M19 12v7" strokeOpacity="0" />
      <path d="M15 15l5-5" />
      <path d="M15 10h5v5" />
    </svg>
  );
}

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
  role,
  isMyApproval,
  isClosed,
  canRemove,
  actionLoading,
  removeLoading,
  onApprove,
  onReject,
  onRemove,
}: {
  p: RecordParticipant;
  role: "APPROVER" | "VIEWER";
  isMyApproval: boolean;
  isClosed: boolean;
  canRemove: boolean;
  actionLoading: string | null;
  removeLoading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const displayName =
    p.participantType === "INTERNAL"
      ? (p.name ?? p.email ?? "Internal user")
      : (p.name ?? p.email ?? "External approver");

  // Row border style by type and role
  const rowClass = [
    "relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
    role === "VIEWER"
      ? "border-(--border-subtle) bg-(--bg-surface-elev) opacity-80"
      : p.participantType === "EXTERNAL"
        ? "border-(--color-warning-soft) bg-(--color-warning-soft)/20"
        : "border-(--border-subtle) bg-(--bg-surface-elev)",
  ].join(" ");

  // Status icon — role and view-aware
  const hasViewed = p.lastUsedAt != null;

  const statusIcon = (() => {
    if (role === "VIEWER") {
      if (hasViewed) {
        return (
          <span title="Viewer has seen this request">
            <IconEye
              size={14}
              className="shrink-0 text-[#4fc3f7]"
              aria-label="Seen"
            />
          </span>
        );
      }
      return (
        <span title="Viewer has not seen this request yet">
          <IconEyeOff
            size={14}
            className="shrink-0 text-(--text-muted)"
            aria-label="Not seen yet"
          />
        </span>
      );
    }

    // Approvers
    if (p.status === "APPROVED") {
      return (
        <span title="Approved">
          <IconCheckCircleFilled
            size={14}
            className="shrink-0 text-(--color-success)"
            aria-label="Approved"
          />
        </span>
      );
    }
    if (p.status === "REJECTED") {
      return (
        <span title="Rejected">
          <IconXCircleFilled
            size={14}
            className="shrink-0 text-(--color-danger)"
            aria-label="Rejected"
          />
        </span>
      );
    }
    // PENDING
    if (hasViewed) {
      return (
        <span title="Approver has seen this request — awaiting their decision">
          <IconHourglass
            size={14}
            className="shrink-0 text-[#4fc3f7]"
            aria-label="Seen — pending decision"
          />
        </span>
      );
    }
    return (
      <span title="Approver has not opened this request yet">
        <IconHourglass
          size={14}
          className="shrink-0 text-(--text-muted)"
          aria-label="Not opened yet"
        />
      </span>
    );
  })();

  return (
    <li className={rowClass}>
      {/* Avatar */}
      <div className="shrink-0">
        {p.participantType === "EXTERNAL" ? (
          <div className="h-6 w-6 flex items-center justify-center rounded-full border border-dashed border-(--border-strong) bg-(--bg-surface) text-(--text-muted)">
            <IconExternalUser size={11} />
          </div>
        ) : (
          <div
            className={[
              "h-6 w-6 shrink-0 flex items-center justify-center rounded-full text-[10px] font-semibold",
              role === "VIEWER"
                ? "bg-(--bg-surface) text-(--text-muted) border border-(--border-subtle)"
                : "bg-(--color-primary-soft) text-(--color-primary)",
            ].join(" ")}
          >
            {(p.name ?? p.email ?? "?")[0]?.toUpperCase() ?? "?"}
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-(--text-primary) leading-tight">
          {displayName}
        </p>
        {p.participantType === "EXTERNAL" && p.name && p.email && (
          <p className="truncate text-[10px] text-(--text-muted)">{p.email}</p>
        )}
        {p.respondedAt && (
          <p className="text-[10px] text-(--text-muted)">
            {new Date(p.respondedAt).toLocaleDateString()}
          </p>
        )}
        {p.responseReason && (
          <p className="text-[10px] italic text-(--text-muted) truncate">
            &ldquo;{p.responseReason}&rdquo;
          </p>
        )}
      </div>

      {/* Right side: status icon + actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {statusIcon}
        {p.status === "PENDING" && !isClosed && isMyApproval && (
          <>
            <button
              type="button"
              disabled={actionLoading === p.id}
              onClick={() => onApprove(p.id)}
              className="cursor-pointer rounded bg-(--color-success-soft) px-2 py-0.5 text-[10px] font-medium text-(--color-success) transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {actionLoading === p.id ? <Spinner size="sm" /> : "Approve"}
            </button>
            <button
              type="button"
              disabled={actionLoading === p.id}
              onClick={() => onReject(p.id)}
              className="cursor-pointer rounded bg-(--color-danger-soft) px-2 py-0.5 text-[10px] font-medium text-(--color-danger) transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {canRemove && p.status === "PENDING" && !isClosed && (
          <button
            type="button"
            disabled={removeLoading}
            onClick={() => onRemove(p.id)}
            title="Remove participant"
            className="cursor-pointer ml-0.5 flex h-5 w-5 items-center justify-center rounded text-(--text-muted) transition-colors hover:bg-(--color-danger-soft) hover:text-(--color-danger) disabled:opacity-50"
          >
            {removeLoading ? <Spinner size="sm" /> : <IconX size={11} />}
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Inline external participant form (approver or viewer) ───────────────────

function ExternalInlineForm({
  recordId,
  email,
  role,
  onSuccess,
  onCancel,
  onParticipantsChange,
}: {
  recordId: string;
  email: string;
  role: "APPROVER" | "VIEWER";
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
  onParticipantsChange?: (updater: (prev: RecordParticipant[]) => RecordParticipant[]) => void;
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
          participantRole: role,
        }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          participantId?: string;
          approvalToken?: string;
          approvalLinkBase?: string;
          expiresAt?: string;
        };
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
      const roleLabel = role === "APPROVER" ? "External approver" : "External viewer";
      toast.addToast("success", `${roleLabel} assigned.`);

      const participantId = json.data?.participantId;
      if (participantId && onParticipantsChange) {
        const newParticipant: RecordParticipant = {
          id: participantId,
          participantType: "EXTERNAL" as const,
          participantRole: role,
          status: "PENDING" as const,
          userId: null,
          email: email.trim().toLowerCase(),
          name: form.name.trim() || null,
          image: null,
          expiresAt: json.data?.expiresAt != null ? String(json.data.expiresAt) : null,
          revokedAt: null,
          lastUsedAt: null,
          respondedAt: null,
          responseReason: null,
          createdAt: new Date().toISOString(),
        };
        onParticipantsChange((prev) => [...prev, newParticipant]);
      } else {
        await onSuccess();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdLink) {
    return (
      <div className="mt-2 rounded-lg border border-(--color-success-soft) bg-(--color-success-soft) overflow-hidden animate-in fade-in duration-150">
        <div className="px-3 py-2.5 space-y-2">
          <p className="text-xs font-semibold text-(--color-success)">
            ✓ {role === "APPROVER" ? "External approver" : "External viewer"} assigned
          </p>
          <p className="text-[11px] text-(--text-secondary)">
            Share this link — expires in {form.expiresInHours === "24" ? "24 hours" : form.expiresInHours === "72" ? "3 days" : "7 days"}.
          </p>
          <div className="rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1.5">
            <p className="break-all font-mono text-[10px] text-(--text-secondary) leading-relaxed">
              {createdLink}
            </p>
          </div>
          <p className="text-[10px] text-(--color-warning)">⚠ This link will not be shown again.</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(createdLink)}
              className="cursor-pointer flex-1 inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) text-xs font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer inline-flex h-7 items-center rounded-lg border border-(--border-subtle) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) overflow-hidden animate-in fade-in duration-150">
      <div className="flex items-center gap-2 border-b border-(--border-subtle) px-3 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-(--border-strong) bg-(--bg-surface) text-(--text-muted)">
          <IconExternalUser size={11} />
        </div>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-(--text-primary)">
          <span className="text-(--color-primary)">{email}</span>
          <span className="ml-1 font-normal text-(--text-muted)">
            · {role === "APPROVER" ? "external approver" : "external viewer"}
          </span>
        </p>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="cursor-pointer flex h-5 w-5 shrink-0 items-center justify-center rounded text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-40"
        >
          <IconX size={11} />
        </button>
      </div>

      <div className="space-y-2.5 px-3 py-2.5">
        {error && (
          <p className="rounded bg-(--color-danger-soft) px-2 py-1 text-xs text-(--color-danger)">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-(--text-muted)">Name (optional)</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Jane Smith"
            disabled={submitting}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-(--text-muted)">Link expires in</label>
          <div className="flex gap-1">
            {(["24", "72", "168"] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setForm((f) => ({ ...f, expiresInHours: h }))}
                className={[
                  "flex-1 rounded border py-1 text-[11px] font-medium transition-colors cursor-pointer",
                  form.expiresInHours === h
                    ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                    : "border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-surface-hover)",
                ].join(" ")}
              >
                {h === "24" ? "24h" : h === "72" ? "3d" : "7d"}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleAssign()}
          className="cursor-pointer w-full inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) text-xs font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
        >
          {submitting && <Spinner size="sm" />}
          {submitting
            ? "Assigning…"
            : role === "APPROVER"
              ? "Assign external approver"
              : "Assign external viewer"}
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
  assignedExternalEmails,
  isClosed,
  canAssign,
  canAssignExternal,
  onSuccess,
  onParticipantsChange,
}: {
  recordId: string;
  role: "APPROVER" | "VIEWER";
  currentUserId: string;
  assignedUserIds: string[];
  assignedExternalEmails: Set<string>;
  isClosed: boolean;
  canAssign: boolean;
  canAssignExternal: boolean;
  onSuccess: () => void | Promise<void>;
  onParticipantsChange?: (updater: (prev: RecordParticipant[]) => RecordParticipant[]) => void;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<WorkspaceUser[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [externalEmail, setExternalEmail] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const [portalStyle, setPortalStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    width: 0,
    zIndex: 9999,
    maxHeight: "320px",
    overflowY: "auto",
    scrollbarWidth: "thin",
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function getPositionStyle(): CSSProperties {
    if (!containerRef.current)
      return { position: "fixed", top: 0, left: 0, width: 0, zIndex: 9999 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      maxHeight: "320px",
      overflowY: "auto",
      scrollbarWidth: "thin",
    };
  }

  function syncDropdownPos() {
    const dropdown = dropdownRef.current;
    const container = containerRef.current;
    if (!dropdown || !container) return;
    const rect = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.bottom <= 100 || rect.top >= viewportHeight - 40) {
      dropdown.style.display = "none";
      return;
    }
    dropdown.style.display = "";
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
  }

  function openDropdown() {
    if (!open) {
      setPortalStyle(getPositionStyle());
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;

    const scrollableAncestors: Element[] = [];
    let el: Element | null = containerRef.current?.parentElement ?? null;
    while (el) {
      const { overflow, overflowY } = window.getComputedStyle(el);
      if (/auto|scroll/.test(overflow + overflowY)) {
        scrollableAncestors.push(el);
      }
      el = el.parentElement;
    }

    for (const ancestor of scrollableAncestors) {
      ancestor.addEventListener("scroll", syncDropdownPos, { passive: true });
    }
    window.addEventListener("resize", syncDropdownPos, { passive: true });

    return () => {
      for (const ancestor of scrollableAncestors) {
        ancestor.removeEventListener("scroll", syncDropdownPos);
      }
      window.removeEventListener("resize", syncDropdownPos);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
    canAssignExternal &&
    query.trim().length > 0 &&
    isValidEmail(query) &&
    filtered.length === 0 &&
    !assignedExternalEmails.has(query.trim().toLowerCase());

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setExternalEmail(null);
    openDropdown();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length > 0 && allUsers === null) {
      debounceRef.current = setTimeout(fetchUsers, DEBOUNCE_MS);
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
        data?: {
          id?: string;
          alreadyAssigned?: boolean;
          reactivated?: boolean;
          participantType?: string;
          participantRole?: string;
          status?: string;
          createdAt?: string;
        };
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.addToast("error", json.error?.message ?? "Failed to assign.");
        return;
      }

      const isAlreadyAssigned = json.data?.alreadyAssigned === true;
      const isReactivated = json.data?.reactivated === true;
      const newId = json.data?.id;

      if (isAlreadyAssigned) {
        toast.addToast("success", "Already assigned.");
      }
      setOpen(false);
      setQuery("");

      if (!isAlreadyAssigned && newId && onParticipantsChange) {
        if (isReactivated) {
          onParticipantsChange((prev) =>
            prev.map((p) =>
              p.id === newId
                ? {
                    ...p,
                    status: "PENDING" as const,
                    respondedAt: null,
                    responseReason: null,
                    revokedAt: null,
                    lastUsedAt: null,
                  }
                : p
            )
          );
          onParticipantsChange((prev) => {
            const exists = prev.some((p) => p.id === newId);
            if (exists) return prev;
            const assignedUser = allUsers?.find((u) => u.user.id === userId);
            const appended: RecordParticipant = {
              id: newId,
              participantType: "INTERNAL",
              participantRole: role,
              status: "PENDING",
              userId: userId,
              email: assignedUser?.user.email ?? null,
              name: assignedUser?.user.name ?? null,
              image: assignedUser?.user.image ?? null,
              expiresAt: null,
              revokedAt: null,
              lastUsedAt: null,
              respondedAt: null,
              responseReason: null,
              createdAt: new Date().toISOString(),
            };
            return [...prev, appended];
          });
        } else {
          const assignedUser = allUsers?.find((u) => u.user.id === userId);
          onParticipantsChange((prev) => [
            ...prev,
            {
              id: newId,
              participantType: "INTERNAL" as const,
              participantRole: role,
              status: "PENDING" as const,
              userId: userId,
              email: assignedUser?.user.email ?? null,
              name: assignedUser?.user.name ?? null,
              image: assignedUser?.user.image ?? null,
              expiresAt: null,
              revokedAt: null,
              lastUsedAt: null,
              respondedAt: null,
              responseReason: null,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } else if (!isAlreadyAssigned) {
        await onSuccess();
      }
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setAssigning(null);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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

  return (
    <div ref={containerRef} className="relative">
      <div
        className={[
          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
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
            openDropdown();
            if (allUsers === null && !loadingUsers) fetchUsers();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            role === "APPROVER"
              ? "Search and assign an approver…"
              : "Search and assign a viewer…"
          }
          className="min-w-0 flex-1 bg-transparent text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          autoComplete="off"
          spellCheck={false}
        />
        {(assigning || loadingUsers) && <Spinner size="sm" />}
      </div>

      {open &&
        !externalEmail &&
        createPortal(
          <div
            ref={dropdownRef}
            className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl"
            style={portalStyle}
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
                      {role === "APPROVER" ? "Assign external approver" : "Assign external viewer"}
                    </p>
                    <p className="truncate text-xs text-(--text-muted)">{query.trim()}</p>
                  </div>
                </button>
              </div>
            )}

            <div className="border-t border-(--border-subtle) px-3 py-1.5">
              <p className="text-[10px] text-(--text-muted)">
                ↑↓ navigate · Enter assign · Esc close
                {canAssignExternal && !showExternalOption && (
                  <span className="ml-2 opacity-60">
                    · type an email to invite externally
                  </span>
                )}
              </p>
            </div>
          </div>,
          document.body
        )}

      {externalEmail && (
        <ExternalInlineForm
          recordId={recordId}
          email={externalEmail}
          role={role}
          onParticipantsChange={onParticipantsChange}
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
  canRemove,
  onRefresh,
  onApprovalCompleted,
  onParticipantsChange,
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
  canRemove: boolean;
  onRefresh: () => void | Promise<void>;
  onApprovalCompleted?: () => void;
  onParticipantsChange?: (updater: (prev: RecordParticipant[]) => RecordParticipant[]) => void;
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
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const roleParticipants = participants.filter((p) => p.participantRole === role);
  const hasPending = roleParticipants.some((p) => p.status === "PENDING");

  // Exclude users already assigned in ANY role (approver or viewer)
  const assignedUserIds = participants
    .filter((p) => p.userId != null)
    .map((p) => p.userId!);

  // Exclude external emails already assigned in ANY role
  const assignedExternalEmails = new Set(
    participants
      .filter((p) => p.participantType === "EXTERNAL" && p.email != null)
      .map((p) => p.email!.toLowerCase())
  );

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
        if (res.status === 404) {
          // Participant was revoked — refresh to update UI silently
          await onRefresh();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.addToast("error", json.error?.message ?? "Action failed.");
        return;
      }
      toast.addToast("success", "Approved.");
      await onRefresh();
      onApprovalCompleted?.();
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
        if (res.status === 404) {
          // Participant was revoked — refresh and close modal
          setRejectModal({ open: false, participantId: null, submitting: false });
          await onRefresh();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.addToast("error", json.error?.message ?? "Rejection failed.");
        return;
      }
      toast.addToast("success", "Rejected.");
      setRejectModal({ open: false, participantId: null, submitting: false });
      await onRefresh();
      onApprovalCompleted?.();
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
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setReminding(false);
    }
  }

  async function handleRemove(participantId: string) {
    setRemoveLoading(participantId);
    try {
      const res = await apiFetch(
        `/api/records/${recordId}/participants/${participantId}`,
        {
          method: "DELETE",
          showToastOnError: false,
        }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", json.error?.message ?? "Failed to remove participant.");
        return;
      }
      onParticipantsChange?.((prev) => prev.filter((p) => p.id !== participantId));
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setRemoveLoading(null);
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
              title="Remind pending approvers"
              className="cursor-pointer inline-flex h-6 w-6 items-center justify-center rounded border border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--color-primary) hover:border-(--color-primary) disabled:opacity-60"
            >
              {reminding ? <Spinner size="sm" /> : <IconSend size={11} />}
            </button>
          )}
        </div>

        <ParticipantSearchInput
          recordId={recordId}
          role={role}
          currentUserId={currentUserId}
          assignedUserIds={assignedUserIds}
          assignedExternalEmails={assignedExternalEmails}
          isClosed={isClosed}
          canAssign={canAssign}
          canAssignExternal={canAssignExternal}
          onSuccess={onRefresh}
          onParticipantsChange={onParticipantsChange}
        />

        <div
          className={[
            "mt-2 space-y-2",
            roleParticipants.length > 4 ? "max-h-[14rem] overflow-y-auto pr-1" : "",
          ].join(" ")}
          style={
            roleParticipants.length > 4
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
                  role={role}
                  isMyApproval={
                    p.participantType === "INTERNAL" &&
                    p.participantRole === "APPROVER" &&
                    p.userId === currentUserId &&
                    p.status === "PENDING" &&
                    p.revokedAt === null
                  }
                  isClosed={isClosed}
                  canRemove={canRemove}
                  actionLoading={actionLoading}
                  removeLoading={removeLoading === p.id}
                  onApprove={handleApprove}
                  onReject={(id) =>
                    setRejectModal({ open: true, participantId: id, submitting: false })
                  }
                  onRemove={handleRemove}
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
  isRequestCreator,
  onRefresh,
  onApprovalCompleted,
  onParticipantsChange,
}: Props) {
  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3">
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
          canRemind={isRequestCreator}
          canRemove={isRequestCreator}
          onRefresh={onRefresh}
          onApprovalCompleted={onApprovalCompleted}
          onParticipantsChange={onParticipantsChange}
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
          canAssignExternal={canAssignExternal}
          canRemind={false}
          canRemove={isRequestCreator}
          onRefresh={onRefresh}
          onApprovalCompleted={onApprovalCompleted}
          onParticipantsChange={onParticipantsChange}
        />
      </div>
    </div>
  );
}
