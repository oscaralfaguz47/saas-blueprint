"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { CardRoot, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconChevronLeft,
  IconFileText,
  IconLink,
  IconAlertCircle,
  IconPlus,
  IconUpload,
  IconDot,
  IconX,
} from "@/components/ui/icons";
import { RejectApprovalModal } from "./reject-approval-modal";
import { ParticipantsPanel } from "./participants-panel";
import { SetPaymentStatusModal } from "./set-payment-status-modal";
import { LinkRecordModal } from "./link-record-modal";
import {
  formatAmount,
  formatDate,
  RECORD_TYPE_LABELS,
  RECORD_STATUS_BADGE,
  RECORD_STATUS_LABELS,
  RECORD_EVENT_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_BADGE,
  RECORD_PRIORITY_LABELS,
  RECORD_APPROVAL_STATUS_LABELS,
  RECORD_CLOSE_REASON_LABELS,
  RECORD_LINK_TYPE_LABELS,
  RECORD_BUDGET_IMPACT_LABELS,
} from "@/lib/record-utils";
import { RECORD_CATEGORY_CONFIG } from "@/lib/record-category-config";
import { resolveMimeType } from "@/lib/evidence-config";
import type {
  RecordDetailExtended,
  RecordDetailResponse,
  RecordParticipant,
  RecordEvidenceItem,
  RecordEventItem,
  RecordComment,
  RecordLinkItem,
  RecordPaymentItem,
} from "@/types/records";

type Props = {
  recordId: string;
  currentUserId: string;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  permissions: string[];
  /** Split-view: override navigation so prev/next stays within the panel */
  onNavigate?: (id: string, key?: string | null) => void;
  /** Split-view: makes the request header sticky within the panel scroll container */
  stickyHeader?: boolean;
};

function numFromUnknown(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeDetailData(
  raw: RecordDetailResponse["data"] & {
    record: RecordDetailExtended & {
      amount?: unknown;
      requestedAmount?: unknown;
      approvedAmount?: unknown;
      taxAmount?: unknown;
    };
  }
): RecordDetailResponse["data"] {
  const r = raw.record;
  return {
    ...raw,
    record: {
      ...r,
      amount: numFromUnknown(r.amount),
      requestedAmount: numFromUnknown(r.requestedAmount),
      approvedAmount: numFromUnknown(r.approvedAmount),
      taxAmount: numFromUnknown(r.taxAmount),
    },
  };
}

export function RequestDetailClient({
  recordId,
  currentUserId,
  currentUserName = null,
  currentUserEmail = null,
  permissions,
  onNavigate,
  stickyHeader = false,
}: Props) {
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  useEffect(() => {
    apiFetchRef.current = apiFetch;
  }, [apiFetch]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fadeCleanupRef = useRef<(() => void) | null>(null);

  const [showDetailTopFade, setShowDetailTopFade] = useState(false);
  const [showDetailBottomFade, setShowDetailBottomFade] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const scrollCallbackRef = useCallback(
    (el: HTMLDivElement | null) => {
      // Cleanup previous node if any
      fadeCleanupRef.current?.();
      fadeCleanupRef.current = null;

      if (!el || !stickyHeader) {
        // Keep scrollContainerRef in sync for the isScrolled effect
        scrollContainerRef.current = null;
        return;
      }

      scrollContainerRef.current = el;

      function updateFades() {
        const { scrollTop, scrollHeight, clientHeight } = el!;
        setShowDetailTopFade(scrollTop > 2);
        setShowDetailBottomFade(scrollTop + clientHeight < scrollHeight - 2);
      }

      // Initial evaluation after layout
      const frame = requestAnimationFrame(updateFades);
      el.addEventListener("scroll", updateFades, { passive: true });
      const ro = new ResizeObserver(updateFades);
      ro.observe(el);

      fadeCleanupRef.current = () => {
        cancelAnimationFrame(frame);
        el.removeEventListener("scroll", updateFades);
        ro.disconnect();
      };
    },
    [stickyHeader]
  );

  const scrollToSection = useCallback((sectionId: string) => {
    const container = scrollContainerRef.current;
    const target = document.getElementById(sectionId);
    if (!target) return;
    if (container && container.contains(target)) {
      const offsetTop = target.offsetTop - 16;
      container.scrollTo({ top: offsetTop, behavior: "smooth" });
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => setIsScrolled(el.scrollTop > 8);
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const toast = useToast();

  const [data, setData] = useState<RecordDetailResponse["data"] | null>(null);
  const updateParticipants = useCallback(
    (updater: (prev: RecordParticipant[]) => RecordParticipant[]) => {
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, participants: updater(prev.participants) };
      });
    },
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [setPaymentOpen, setSetPaymentOpen] = useState(false);
  const [linkRecordOpen, setLinkRecordOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeReason, setCloseReason] = useState<string>("APPROVED_AND_COMPLETED");
  const [closeNotes, setCloseNotes] = useState("");
  const [approvalActionLoading, setApprovalActionLoading] = useState<string | null>(null);
  const [bannerRejectModalOpen, setBannerRejectModalOpen] = useState(false);
  const [bannerRejectTargetId, setBannerRejectTargetId] = useState<string | null>(null);
  const [bannerRejectSubmitting, setBannerRejectSubmitting] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const canClose = permissions.includes("tenant.requests.close");
  const canComment = permissions.includes("tenant.requests.comment");
  const canExport = permissions.includes("tenant.requests.export");
  const canAddEvidence = permissions.includes("tenant.evidence.add");
  const canRemoveEvidence = permissions.includes("tenant.evidence.remove");
  const canManagePayment = permissions.includes("tenant.payments.manage");
  const canLink = permissions.includes("tenant.requests.link");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchRef.current(`/api/records/${recordId}`, {
        showToastOnError: false,
      });
      if (res.status === 404) {
        setError("Request not found or you don't have access.");
        return;
      }
      if (!res.ok) {
        setError("Failed to load request.");
        return;
      }
      const json = (await res.json()) as RecordDetailResponse & {
        data: RecordDetailResponse["data"] & {
          record: RecordDetailExtended & {
            amount?: unknown;
            requestedAmount?: unknown;
            approvedAmount?: unknown;
            taxAmount?: unknown;
          };
        };
      };
      setData(normalizeDetailData(json.data));
    } catch {
      setError("Failed to load request.");
    } finally {
      setLoading(false);
    }
  }, [recordId]); // apiFetch via stable ref — recordId is the only meaningful dep

  const handleParticipantAction = useCallback(
    async (
      participantId: string,
      action: "APPROVE" | "REJECT",
      comment?: string
    ): Promise<boolean> => {
      setApprovalActionLoading(participantId);
      try {
        const res = await apiFetch(`/api/records/${recordId}/participants/${participantId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, comment }),
          showToastOnError: false,
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          toast.addToast("error", json.error?.message ?? "Action failed.");
          return false;
        }
        toast.addToast("success", action === "APPROVE" ? "Approved." : "Rejected.");
        await load();
        return true;
      } catch {
        toast.addToast("error", "Network error.");
        return false;
      } finally {
        setApprovalActionLoading(null);
      }
    },
    [apiFetch, recordId, toast, load]
  );

  useEffect(() => {
    // Small debounce prevents double-fetch when selectedId is set twice
    // in the same React batch (e.g. handleSelectRecord + pathname sync)
    const t = setTimeout(() => {
      void load();
    }, 20);
    return () => clearTimeout(t);
  }, [load]);

  // Escape closes the inline close-request dialog
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && closeDialogOpen) {
        setCloseDialogOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeDialogOpen]);

  async function handleCloseRequest() {
    if (!data || closing) return;
    setClosing(true);
    try {
      const res = await apiFetch(`/api/records/${recordId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closeReason,
          closeReasonNotes: closeNotes.trim() || undefined,
        }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", json.error?.message ?? "Failed to close request.");
        return;
      }
      toast.addToast("success", "Request closed.");
      setCloseDialogOpen(false);
      setCloseNotes("");
      await load();
    } catch {
      toast.addToast("error", "Network error. Please try again.");
    } finally {
      setClosing(false);
    }
  }

  async function handleExportPdf() {
    const res = await apiFetch(`/api/records/${recordId}/export`, {
      method: "POST",
      showToastOnError: false,
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      toast.addToast("error", json.error?.message ?? "Export failed.");
      return;
    }
    toast.addToast("success", "Export queued. Check back shortly.");
  }

  if (loading) return <RequestDetailSkeleton />;

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/requests"
          className="inline-flex items-center gap-1.5 text-sm text-(--text-muted) transition-colors hover:text-(--text-primary)"
        >
          <IconChevronLeft size={14} />
          Back to requests
        </Link>
        <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { record, evidence, participants, timeline, comments, links, payment, missingProof } =
    data;
  const rec = record as RecordDetailExtended;
  const isRequestCreator = rec.createdByUserId === currentUserId;
  const canAssignInternal = isRequestCreator;
  const canAssignExternal = isRequestCreator;
  const isClosed = rec.status === "CLOSED";
  const catConfig = RECORD_CATEGORY_CONFIG[rec.type];
  const approverParticipants = participants.filter((p) => p.participantRole === "APPROVER");
  const showSubmitForApproval =
    rec.status === "OPEN" &&
    approverParticipants.length === 0 &&
    canAssignInternal &&
    !isClosed;
  const createdByLabel =
    rec.createdByUserId === currentUserId
      ? currentUserName || currentUserEmail || "you"
      : rec.createdByUserId
        ? "a teammate"
        : "unknown";
  const neededByPast =
    rec.neededByDate &&
    !isClosed &&
    new Date(rec.neededByDate).getTime() < new Date().setHours(0, 0, 0, 0);
  const closeReasonOptions = (
    catConfig?.defaultCloseReasons?.length
      ? catConfig.defaultCloseReasons
      : (Object.keys(RECORD_CLOSE_REASON_LABELS) as string[])
  ).map((k) => ({ value: k, label: RECORD_CLOSE_REASON_LABELS[k] ?? k }));

  const requiredOk = (() => {
    if (!catConfig) return true;
    for (const f of catConfig.requiredFields) {
      if (f === "title" && !rec.title?.trim()) return false;
      if (f === "requestedAmount" && rec.requestedAmount == null) return false;
      if (f === "currencyCode" && !rec.currencyCode?.trim() && rec.requestedAmount != null)
        return false;
      if (f === "businessJustification" && !rec.businessJustification?.trim()) return false;
      if (f === "vendorName" && !rec.vendorName?.trim()) return false;
      if (f === "payeeName" && !rec.payeeName?.trim()) return false;
      if (f === "neededByDate" && !rec.neededByDate) return false;
      if (f === "policyExceptionReason" && !rec.policyExceptionReason?.trim()) return false;
    }
    return true;
  })();

  const healthWarnings =
    (requiredOk ? 0 : 1) +
    (evidence.length === 0 ? 1 : 0) +
    (approverParticipants.length === 0 ? 1 : 0) +
    (rec.hasPolicyException ? 1 : 0) +
    (rec.possibleDuplicate ? 1 : 0) +
    (rec.overdue ? 1 : 0) +
    (rec.isOverBudget ? 1 : 0) +
    (rec.status === "AWAITING_INFO" ? 1 : 0);

  const healthSummary =
    healthWarnings === 0 ? "All clear" : healthWarnings <= 2 ? "Needs attention" : "Action required";

  return (
    <div className={stickyHeader ? "flex h-full flex-col overflow-hidden" : "space-y-6"}>
      <div
        className={stickyHeader ? "relative min-h-0 flex-1 flex flex-col" : "contents"}
      >
        {stickyHeader && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 right-0 h-8 z-10 transition-opacity duration-200"
            style={{
              opacity: showDetailTopFade ? 1 : 0,
              background: "linear-gradient(to top, transparent, var(--bg-main))",
            }}
          />
        )}
        {stickyHeader && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 z-10 transition-opacity duration-200"
            style={{
              opacity: showDetailBottomFade ? 1 : 0,
              background: "linear-gradient(to bottom, transparent, var(--bg-main))",
            }}
          />
        )}
        <div
          ref={scrollCallbackRef}
          className={
            stickyHeader
              ? "min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6"
              : "contents"
          }
          style={
            stickyHeader && isScrolled
              ? { boxShadow: "inset 0 8px 8px -8px rgba(0,0,0,0.08)" }
              : undefined
          }
        >
          <div className={stickyHeader ? "pt-4 pb-0 space-y-3" : "space-y-3"}>
            {!stickyHeader && (
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/app/requests"
                  className="inline-flex items-center gap-1.5 text-sm text-(--text-muted) transition-colors hover:text-(--text-primary)"
                >
                  <IconChevronLeft size={14} />
                  Back to requests
                </Link>
                <RequestKeyboardNav currentId={recordId} onNavigate={onNavigate} />
              </div>
            )}
            <header className="space-y-2.5 rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-3 sm:pl-4 sm:pr-4 sm:pt-4 sm:pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title="Click to copy request ID"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(rec.recordKey ?? rec.id)
                      .catch(() => {});
                  }}
                  className="rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-2 py-0.5 font-mono text-sm font-semibold text-(--text-primary) transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-soft) hover:text-(--color-primary)"
                >
                  {rec.recordKey ?? `#${rec.id.slice(0, 8)}`}
                </button>
                <Badge variant={RECORD_STATUS_BADGE[rec.status]}>
                  {RECORD_STATUS_LABELS[rec.status]}
                </Badge>
                <Badge variant="secondary">{RECORD_TYPE_LABELS[rec.type]}</Badge>
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    rec.priority === "URGENT"
                      ? "border-(--color-danger-soft) bg-(--color-danger-soft) text-(--color-danger)"
                      : rec.priority === "HIGH"
                        ? "border-(--color-warning-soft) bg-(--color-warning-soft) text-(--color-warning)"
                        : rec.priority === "MEDIUM"
                          ? "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-secondary)"
                          : "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-muted)",
                  ].join(" ")}
                >
                  <IconDot
                    size={8}
                    className={
                      rec.priority === "URGENT"
                        ? "text-(--color-danger)"
                        : rec.priority === "HIGH"
                          ? "text-(--color-warning)"
                          : rec.priority === "MEDIUM"
                            ? "text-(--color-primary)"
                            : "text-(--text-muted)"
                    }
                  />
                  <span className="text-(--text-muted) font-normal">Priority:</span>
                  {RECORD_PRIORITY_LABELS[rec.priority] ?? rec.priority}
                </span>
                {rec.overdue && (
                  <Badge variant="destructive">Overdue</Badge>
                )}
                <span className="text-xs text-(--text-muted)">
                  Created {formatDate(rec.createdAt)} by {createdByLabel}
                </span>
              </div>
              <h1 className="break-words text-2xl font-semibold tracking-tight text-(--text-primary)">
                {rec.title}
              </h1>
              {rec.neededByDate && (
                <div className="text-sm">
                  <span className={neededByPast ? "font-medium text-(--color-warning)" : "text-(--text-muted)"}>
                    Needed by: {formatDate(rec.neededByDate)}
                    {neededByPast ? " · URGENT" : ""}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {(rec.requestedAmount != null || rec.amount != null) && (
                  <span className="font-medium text-(--text-primary)">
                    {formatAmount(
                      rec.requestedAmount ?? rec.amount,
                      rec.currencyCode ?? rec.currency
                    )}
                  </span>
                )}
                <span className="text-(--text-secondary)">
                  Approval: {RECORD_APPROVAL_STATUS_LABELS[rec.approvalStatus] ?? rec.approvalStatus}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-(--border-subtle) pt-3">
                {showSubmitForApproval && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("section-approvers")}
                    className="cursor-pointer inline-flex h-9 items-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm hover:bg-(--color-primary-hover)"
                  >
                    Submit for approval
                  </button>
                )}
                {canAssignInternal && !isClosed && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("section-approvers")}
                    className="cursor-pointer inline-flex h-9 items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-secondary) transition-colors hover:border-(--border-strong) hover:text-(--text-primary)"
                  >
                    Assign approver
                  </button>
                )}
                {canExport && (
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    className="cursor-pointer inline-flex h-9 items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-secondary) transition-colors hover:border-(--border-strong) hover:text-(--text-primary)"
                  >
                    Export PDF
                  </button>
                )}
                {canClose && !isClosed && (
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => {
                      setCloseReason(closeReasonOptions[0]?.value ?? "APPROVED_AND_COMPLETED");
                      setCloseDialogOpen(true);
                    }}
                    className="cursor-pointer inline-flex h-9 items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-secondary) transition-colors hover:border-(--color-danger-soft) hover:bg-(--color-danger-soft) hover:text-(--color-danger)"
                  >
                    Close request
                  </button>
                )}
                {record.status === "DRAFT" && record.createdByUserId === currentUserId && (
                  <SubmitDraftButton recordId={recordId} onSuccess={load} />
                )}
              </div>
            </header>
          </div>

          <div className="mt-4 space-y-6">
      <div className="mt-2">
        <AllActionBanners
          rec={rec}
          participants={participants}
          evidence={evidence}
          currentUserId={currentUserId}
          canAssignInternal={canAssignInternal}
          canAssignExternal={canAssignExternal}
          canAddEvidence={canAddEvidence}
          onOpenAssignInternal={() => scrollToSection("section-approvers")}
          onApprove={(participantId) => void handleParticipantAction(participantId, "APPROVE")}
          onReject={(participantId) => {
            setBannerRejectTargetId(participantId);
            setBannerRejectModalOpen(true);
          }}
          actionLoading={approvalActionLoading}
          onScrollToSection={scrollToSection}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(rec.requestedAmount != null || rec.approvedAmount != null) && (
            <CardRoot>
              <CardHeader>
                <h2 className="text-sm font-semibold text-(--text-primary)">Financial details</h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-(--text-muted)">Requested amount</p>
                    <p
                      className={`mt-1 text-xl font-semibold tabular-nums ${
                        rec.requestedAmount != null ? "text-(--text-primary)" : "text-(--text-muted)"
                      }`}
                    >
                      {rec.requestedAmount != null
                        ? formatAmount(rec.requestedAmount, rec.currencyCode ?? rec.currency)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-(--text-muted)">Approved amount</p>
                    <p
                      className={`mt-1 text-xl font-semibold tabular-nums ${
                        rec.approvedAmount != null ? "text-(--text-primary)" : "text-(--text-muted)"
                      }`}
                    >
                      {rec.approvedAmount != null
                        ? formatAmount(rec.approvedAmount, rec.currencyCode ?? rec.currency)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-(--text-muted)">Currency</p>
                    <p className="mt-1 text-xl font-semibold text-(--text-primary)">
                      {rec.currencyCode ?? rec.currency ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {rec.amountIsEstimated && <Badge variant="warning">Amount estimated</Badge>}
                  {rec.budgetImpactType != null && (
                    <Badge variant="secondary">
                      {RECORD_BUDGET_IMPACT_LABELS[rec.budgetImpactType] ?? rec.budgetImpactType}
                    </Badge>
                  )}
                  {rec.isRecurring && <Badge variant="secondary">Recurring</Badge>}
                </div>
                {rec.taxAmount != null && (
                  <div className="mt-4 border-t border-(--border-subtle) pt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-(--text-muted)">Tax amount</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-(--text-primary)">
                          {formatAmount(rec.taxAmount, rec.currencyCode ?? rec.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-(--text-muted)">Tax treatment</p>
                        <p className="mt-1 text-sm text-(--text-primary)">
                          {rec.taxIncluded === true
                            ? "Included in amount"
                            : rec.taxIncluded === false
                              ? "Excluded from amount"
                              : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {rec.isRecurring && rec.recurrenceNotes && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-(--text-muted)">Recurrence details</p>
                    <p className="mt-1 text-sm text-(--text-secondary)">{rec.recurrenceNotes}</p>
                  </div>
                )}
              </CardContent>
            </CardRoot>
          )}

          {(rec.description || rec.businessJustification || (rec.hasPolicyException && rec.policyExceptionReason)) && (
            <CardRoot>
              <CardHeader>
                <h2 className="text-sm font-semibold text-(--text-primary)">Request details</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {rec.description && (
                  <div>
                    <p className="text-xs font-medium text-(--text-muted)">Description</p>
                    <p className="mt-1 text-sm leading-relaxed text-(--text-secondary) whitespace-pre-wrap">
                      {rec.description}
                    </p>
                  </div>
                )}
                {rec.businessJustification && (
                  <div>
                    <p className="text-xs font-medium text-(--text-muted)">Business justification</p>
                    <p className="mt-1 text-sm leading-relaxed text-(--text-secondary) whitespace-pre-wrap">
                      {rec.businessJustification}
                    </p>
                  </div>
                )}
                {rec.hasPolicyException && rec.policyExceptionReason && (
                  <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) px-3 py-2.5">
                    <p className="text-xs font-semibold text-(--color-warning)">
                      ⚠ Policy exception reason
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-(--color-warning) whitespace-pre-wrap">
                      {rec.policyExceptionReason}
                    </p>
                  </div>
                )}
              </CardContent>
            </CardRoot>
          )}

          {(rec.vendorName || rec.payeeName || rec.invoiceNumber || rec.contractReference || rec.purchaseOrderRef) && (
            <CardRoot>
              <CardHeader>
                <h2 className="text-sm font-semibold text-(--text-primary)">Vendor & payment</h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {rec.vendorName && (
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Vendor / Supplier</p>
                      <p className="mt-1 text-sm font-medium text-(--text-primary)">{rec.vendorName}</p>
                    </div>
                  )}
                  {rec.payeeName && (
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Payee / Beneficiary</p>
                      <p className="mt-1 text-sm font-medium text-(--text-primary)">{rec.payeeName}</p>
                    </div>
                  )}
                  {rec.invoiceNumber && (
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Invoice number</p>
                      <p className="mt-1 text-sm font-mono text-(--text-primary)">{rec.invoiceNumber}</p>
                    </div>
                  )}
                  {rec.contractReference && (
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Contract reference</p>
                      <p className="mt-1 text-sm font-mono text-(--text-primary)">{rec.contractReference}</p>
                    </div>
                  )}
                  {rec.purchaseOrderRef && (
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Purchase order ref</p>
                      <p className="mt-1 text-sm font-mono text-(--text-primary)">{rec.purchaseOrderRef}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </CardRoot>
          )}

          <div id="section-evidence">
            <EvidenceSection
              evidence={evidence}
              isClosed={isClosed}
              recordId={recordId}
              canRemoveEvidence={canRemoveEvidence}
              onRefresh={load}
            />
            <AddEvidenceSection
              recordId={recordId}
              isClosed={isClosed}
              canAdd={canAddEvidence}
              onRefresh={load}
            />
          </div>

          <div id="section-comments">
            <CommentSection
              recordId={recordId}
              isClosed={isClosed}
              canComment={canComment}
              onRefresh={load}
            />
          </div>

          <TimelineSection timeline={timeline} comments={comments} />
        </div>

        <div className="space-y-6">
          <div id="section-approvers">
            <ParticipantsPanel
              participants={participants}
              recordId={recordId}
              isClosed={isClosed}
              currentUserId={currentUserId}
              canAssignInternal={canAssignInternal}
              canAssignExternal={canAssignExternal}
              isRequestCreator={isRequestCreator}
              onRefresh={load}
              onParticipantsChange={updateParticipants}
            />
          </div>

          <div id="section-links">
            <LinkedSection
              links={links}
              currentRecordId={recordId}
              canLink={canLink}
              isClosed={isClosed}
              onOpenLink={() => setLinkRecordOpen(true)}
            />
          </div>

          <CardRoot>
            <CardHeader>
              <h2 className="text-sm font-semibold text-(--text-primary)">Request health</h2>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs font-medium text-(--text-muted)">{healthSummary}</p>
              <ul className="space-y-1.5 text-xs">
                <li className={requiredOk ? "text-(--color-success)" : "text-(--color-warning)"}>
                  {requiredOk ? "✅ Required fields complete" : "⚠ Missing required fields"}
                </li>
                <li className={evidence.length > 0 ? "text-(--color-success)" : "text-(--color-warning)"}>
                  {evidence.length > 0
                    ? "✅ Evidence attached"
                    : "⚠ No supporting evidence has been added yet"}
                </li>
                <li
                  className={
                    approverParticipants.length > 0 ? "text-(--color-success)" : "text-(--color-warning)"
                  }
                >
                  {approverParticipants.length > 0
                    ? "✅ Approvers assigned"
                    : "⚠ No approvers assigned yet"}
                </li>
                {rec.hasPolicyException && (
                  <li className="text-(--color-warning)">⚠ Policy exception flagged</li>
                )}
                {rec.possibleDuplicate && (
                  <li className="text-(--color-warning)">⚠ Possible duplicate</li>
                )}
                {rec.overdue && <li className="text-(--color-warning)">⚠ Overdue</li>}
                {rec.isOverBudget && <li className="text-(--color-warning)">⚠ Over budget</li>}
                {rec.status === "AWAITING_INFO" && (
                  <li className="text-(--color-warning)">⚠ Awaiting info</li>
                )}
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                {evidence.length === 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("section-evidence")}
                    className="cursor-pointer text-xs text-(--color-primary) hover:underline"
                  >
                    Add evidence
                  </button>
                )}
                {approverParticipants.length === 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("section-approvers")}
                    className="cursor-pointer text-xs text-(--color-primary) hover:underline"
                  >
                    Assign approvers
                  </button>
                )}
              </div>
            </CardContent>
          </CardRoot>

          {(rec.department ?? rec.costCenter ?? rec.riskLevel) && (
            <CardRoot>
              <CardHeader>
                <h2 className="text-sm font-semibold text-(--text-primary)">Organizational context</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {rec.department && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-(--text-muted)">Department</p>
                    <p className="text-xs text-right font-medium text-(--text-primary)">
                      {rec.department.name}
                      {rec.department.code ? (
                        <span className="ml-1.5 font-normal text-(--text-muted)">
                          ({rec.department.code})
                        </span>
                      ) : null}
                    </p>
                  </div>
                )}
                {rec.costCenter && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-(--text-muted)">Cost center</p>
                    <p className="text-xs text-right font-medium text-(--text-primary)">
                      {rec.costCenter.name}
                      <span className="ml-1.5 font-normal text-(--text-muted)">
                        ({rec.costCenter.code})
                      </span>
                    </p>
                  </div>
                )}
                {rec.costCenter?.department && !rec.department && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-(--text-muted)">Department</p>
                    <p className="text-xs text-right font-medium text-(--text-primary)">
                      {rec.costCenter.department.name}
                    </p>
                  </div>
                )}
                {rec.riskLevel && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-(--text-muted)">Risk level</p>
                    <span
                      className={[
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                        rec.riskLevel === "HIGH"
                          ? "bg-(--color-danger-soft) text-(--color-danger)"
                          : rec.riskLevel === "MEDIUM"
                            ? "bg-(--color-warning-soft) text-(--color-warning)"
                            : "bg-(--bg-surface-elev) text-(--text-muted)",
                      ].join(" ")}
                    >
                      {rec.riskLevel.charAt(0) + rec.riskLevel.slice(1).toLowerCase()}
                    </span>
                  </div>
                )}
              </CardContent>
            </CardRoot>
          )}

          {record.requestedAmount != null && record.requestedAmount > 0 && (
            <PaymentSection
              payment={payment}
              missingProof={missingProof}
              canManage={canManagePayment}
              canRemoveEvidence={canRemoveEvidence}
              isClosed={isClosed}
              recordId={recordId}
              onOpenSetStatus={() => setSetPaymentOpen(true)}
              onRefresh={load}
            />
          )}
        </div>
      </div>
          </div>
        </div>
      </div>

      {data && (
        <SetPaymentStatusModal
          open={setPaymentOpen}
          onClose={() => setSetPaymentOpen(false)}
          recordId={recordId}
          currentStatus={data.payment?.status ?? null}
          onSuccess={load}
        />
      )}
      <LinkRecordModal
        open={linkRecordOpen}
        onClose={() => setLinkRecordOpen(false)}
        recordId={recordId}
        onSuccess={load}
      />
      <RejectApprovalModal
        open={bannerRejectModalOpen}
        onClose={() => {
          setBannerRejectModalOpen(false);
          setBannerRejectTargetId(null);
        }}
        submitting={bannerRejectSubmitting}
        onConfirm={async (reason) => {
          if (!bannerRejectTargetId) return;
          setBannerRejectSubmitting(true);
          try {
            const ok = await handleParticipantAction(bannerRejectTargetId, "REJECT", reason);
            if (ok) {
              setBannerRejectModalOpen(false);
              setBannerRejectTargetId(null);
            }
          } finally {
            setBannerRejectSubmitting(false);
          }
        }}
      />
      {closeDialogOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop — only catches clicks, does NOT block scroll */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => !closing && setCloseDialogOpen(false)}
              aria-hidden
              style={{ pointerEvents: "auto", touchAction: "none" }}
            />

            {/* Panel */}
            <div
              className="fixed z-50 animate-in fade-in duration-150"
              style={(() => {
                const margin = 8;
                const panelWidth = Math.min(window.innerWidth - margin * 2, 420);

                if (!closeButtonRef.current) {
                  return {
                    bottom: 16,
                    left: margin,
                    right: margin,
                    width: "auto",
                  };
                }

                const rect = closeButtonRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;

                // Horizontal: align left edge with button, clamp to viewport
                const left = Math.max(
                  margin,
                  Math.min(rect.left, window.innerWidth - panelWidth - margin)
                );

                if (spaceBelow >= 280 || spaceBelow >= spaceAbove) {
                  // Open below button
                  return {
                    top: rect.bottom + 6,
                    left,
                    width: panelWidth,
                  };
                } else {
                  // Open above button
                  return {
                    bottom: window.innerHeight - rect.top + 6,
                    left,
                    width: panelWidth,
                  };
                }
              })()}
            >
              <div className="overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl ring-1 ring-black/5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-(--border-subtle) px-4 py-3">
                  <p className="text-sm font-semibold text-(--text-primary)">Close request</p>
                  <button
                    type="button"
                    onClick={() => setCloseDialogOpen(false)}
                    disabled={closing}
                    className="cursor-pointer flex h-6 w-6 items-center justify-center rounded text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-40"
                  >
                    <IconX size={13} />
                  </button>
                </div>

                {/* Body */}
                <div className="space-y-3 px-4 py-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-(--text-muted)">
                      Reason for closing
                    </label>
                    <select
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      className="h-9 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 text-sm text-(--text-primary) focus:ring-2 focus:ring-(--color-focus-ring) focus:outline-none"
                    >
                      {closeReasonOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-(--text-muted)">
                      Notes{" "}
                      <span className="font-normal opacity-60">(optional)</span>
                    </label>
                    <Textarea
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="Optional context for the audit log…"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-(--border-subtle) px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setCloseDialogOpen(false)}
                    disabled={closing}
                    className="cursor-pointer inline-flex h-8 items-center rounded-lg border border-(--border-subtle) px-3 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCloseRequest()}
                    disabled={closing}
                    className="cursor-pointer inline-flex h-8 items-center gap-2 rounded-lg bg-(--color-danger) px-3 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
                  >
                    {closing && <Spinner size="sm" />}
                    Close request
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium tracking-wide text-(--text-muted) uppercase">
        {label}
      </p>
      <p className="text-sm text-(--text-primary)">{value}</p>
    </div>
  );
}

function DownloadEvidenceButton({
  evidenceId,
  recordId,
  fileName,
}: {
  evidenceId: string;
  recordId: string;
  fileName: string | null;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/records/${recordId}/evidence/${evidenceId}`, {
        showToastOnError: false,
      });
      if (!res.ok) {
        toast.addToast("error", "Failed to get download link.");
        return;
      }
      const json = (await res.json()) as {
        data: { downloadUrl: string; fileName: string | null };
      };
      const a = document.createElement("a");
      a.href = json.data.downloadUrl;
      a.download = json.data.fileName ?? fileName ?? "file";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.addToast("error", "Download failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={loading}
      className="ml-auto shrink-0 rounded px-2 py-1 text-xs text-(--color-primary) transition-opacity hover:underline disabled:opacity-50"
    >
      {loading ? "…" : "Download"}
    </button>
  );
}

function EvidenceSection({
  evidence,
  isClosed,
  recordId,
  canRemoveEvidence,
  onRefresh,
}: {
  evidence: RecordEvidenceItem[];
  isClosed: boolean;
  recordId: string;
  canRemoveEvidence: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  if (evidence.length === 0 && isClosed) return null;
  return (
    <CardRoot>
      <CardHeader>
        <h2 className="text-sm font-semibold text-(--text-primary)">
          Evidence
          {evidence.length > 0 && (
            <span className="ml-1.5 font-normal text-(--text-muted)">({evidence.length})</span>
          )}
        </h2>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No supporting evidence has been added yet.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5"
              >
                {ev.evidenceType === "LINK" ? (
                  <IconLink size={14} className="shrink-0 text-(--text-muted)" />
                ) : (
                  <IconFileText size={14} className="shrink-0 text-(--text-muted)" />
                )}
                <div className="min-w-0 flex-1">
                  {ev.evidenceType === "LINK" && ev.url ? (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-(--color-primary) hover:underline"
                    >
                      {ev.label ?? ev.url}
                    </a>
                  ) : (
                    <span className="block truncate text-sm text-(--text-primary)">
                      {ev.label ?? ev.fileName ?? "File"}
                    </span>
                  )}
                  <span className="text-xs text-(--text-muted)">
                    {formatDate(ev.createdAt)}
                    {ev.sizeBytes != null && ` · ${(ev.sizeBytes / 1024).toFixed(0)} KB`}
                  </span>
                </div>
                {ev.evidenceType === "FILE" && (
                  <DownloadEvidenceButton
                    evidenceId={ev.id}
                    recordId={recordId}
                    fileName={ev.fileName}
                  />
                )}
                {canRemoveEvidence && !isClosed && (
                  <RemoveEvidenceButton
                    evidenceId={ev.id}
                    recordId={recordId}
                    onSuccess={onRefresh}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </CardRoot>
  );
}

function RemoveEvidenceButton({
  evidenceId,
  recordId,
  onSuccess,
}: {
  evidenceId: string;
  recordId: string;
  onSuccess: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded px-2 py-1 text-xs text-(--color-danger) opacity-60 transition-opacity hover:opacity-100"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="text-xs text-(--text-muted)">Remove?</span>
      <button
        type="button"
        onClick={async () => {
          setLoading(true);
          try {
            const res = await apiFetch(`/api/records/${recordId}/evidence/${evidenceId}`, {
              method: "DELETE",
              showToastOnError: false,
            });
            if (!res.ok) {
              const json = (await res.json().catch(() => ({}))) as {
                error?: { message?: string };
              };
              toast.addToast("error", json.error?.message ?? "Failed to remove.");
              setConfirming(false);
              return;
            }
            toast.addToast("success", "Evidence removed.");
            await onSuccess();
          } catch {
            toast.addToast("error", "Network error.");
          } finally {
            setLoading(false);
            setConfirming(false);
          }
        }}
        disabled={loading}
        className="rounded px-1.5 py-0.5 text-xs font-medium text-(--color-danger) transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {loading ? "…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded px-1.5 py-0.5 text-xs text-(--text-muted) transition-opacity hover:opacity-80"
      >
        No
      </button>
    </div>
  );
}

function TimelineSection({
  timeline,
  comments,
}: {
  timeline: RecordEventItem[];
  comments: RecordComment[];
}) {
  const commentMap = new Map(comments.map((c) => [c.id, c]));

  const sortedEvents = [...timeline].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  return (
    <CardRoot>
      <CardHeader>
        <h2 className="text-sm font-semibold text-(--text-primary)">Timeline</h2>
      </CardHeader>
      <CardContent>
        {sortedEvents.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No activity recorded yet.</p>
        ) : (
          <ol className="space-y-4">
            {sortedEvents.map((ev) => {
              const commentId =
                ev.eventType === "COMMENT_ADDED"
                  ? (ev.metadata?.commentId as string | undefined)
                  : undefined;
              const comment = commentId ? commentMap.get(commentId) : undefined;

              return (
                <li key={ev.id} className="flex gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--border-subtle) bg-(--bg-surface-elev)">
                    <span className="h-1.5 w-1.5 rounded-full bg-(--text-muted)" />
                  </div>
                  <div className="min-w-0 flex-1 border-b border-(--border-subtle) pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={[
                          "text-sm font-medium",
                          comment?.isCritical
                            ? "text-(--color-danger)"
                            : "text-(--text-primary)",
                        ].join(" ")}
                      >
                        {RECORD_EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        {ev.eventType === "EVIDENCE_FILE_ADDED" &&
                        ev.metadata?.fileName != null &&
                        ev.metadata.fileName !== "" ? (
                          <span className="ml-1 font-normal text-(--text-muted)">
                            — {String(ev.metadata.fileName)}
                          </span>
                        ) : null}
                        {ev.eventType === "EVIDENCE_LINK_ADDED" &&
                        ev.metadata?.label != null &&
                        ev.metadata.label !== "" ? (
                          <span className="ml-1 font-normal text-(--text-muted)">
                            — {String(ev.metadata.label)}
                          </span>
                        ) : null}
                        {ev.eventType === "EVIDENCE_FILE_REMOVED" &&
                        (ev.metadata?.fileName != null || ev.metadata?.label != null) ? (
                          <span className="ml-1 font-normal text-(--text-muted)">
                            — {String(ev.metadata?.fileName ?? ev.metadata?.label ?? "")}
                          </span>
                        ) : null}
                        {ev.eventType === "EVIDENCE_LINK_REMOVED" &&
                        ev.metadata?.label != null &&
                        ev.metadata.label !== "" ? (
                          <span className="ml-1 font-normal text-(--text-muted)">
                            — {String(ev.metadata.label)}
                          </span>
                        ) : null}
                        {ev.eventType === "PAYMENT_EVIDENCE_REMOVED" &&
                        (ev.metadata?.fileName != null || ev.metadata?.label != null) ? (
                          <span className="ml-1 font-normal text-(--text-muted)">
                            — {String(ev.metadata?.fileName ?? ev.metadata?.label ?? "")}
                          </span>
                        ) : null}
                      </span>
                      {comment?.isCritical && (
                        <span className="flex items-center gap-1 text-xs text-(--color-danger)">
                          <IconAlertCircle size={11} />
                          Action required
                        </span>
                      )}
                      <span className="text-xs text-(--text-muted)">{formatDate(ev.occurredAt)}</span>
                    </div>
                    {(ev.actorName || ev.actorDisplayEmail) && (
                      <p className="mt-0.5 text-xs text-(--text-muted)">
                        by {ev.actorName ?? ev.actorDisplayEmail}
                      </p>
                    )}
                    {comment && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-(--text-secondary)">
                        {comment.content}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </CardRoot>
  );
}

function SubmitDraftButton({
  recordId,
  onSuccess,
}: {
  recordId: string;
  onSuccess: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "OPEN" }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", json.error?.message ?? "Failed to submit.");
        return;
      }
      toast.addToast("success", "Request submitted.");
      await onSuccess();
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSubmit()}
      disabled={submitting}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
    >
      {submitting && <Spinner size="sm" />}
      {submitting ? "Submitting…" : "Submit request"}
    </button>
  );
}

function CommentSection({
  recordId,
  isClosed,
  canComment,
  onRefresh,
}: {
  recordId: string;
  isClosed: boolean;
  canComment: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<
    { user: { id: string; name: string | null; email: string | null } }[]
  >([]);

  useEffect(() => {
    if (!mentionOpen) return;
    apiFetch("/api/tenant/users?context=assignment", { showToastOnError: false })
      .then((r) => r.json())
      .then(
        (json: {
          data?: {
            users?: { user: { id: string; name: string | null; email: string | null } }[];
          };
        }) => {
          setMentionUsers(json.data?.users ?? []);
        }
      )
      .catch(() => {});
  }, [mentionOpen, apiFetch]);

  const filteredMentions = mentionUsers.filter((u) => {
    if (!mentionSearch) return true;
    const q = mentionSearch.toLowerCase();
    return (
      u.user.name?.toLowerCase().includes(q) ||
      (u.user.email?.toLowerCase().includes(q) ?? false)
    );
  });

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([a-zA-Z0-9._\-\s]*)$/);
    if (match) {
      setMentionSearch(match[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
      setMentionSearch(null);
    }
  }

  function insertMention(user: { name: string | null; email: string | null }) {
    const handle = user.name ?? user.email ?? "user";
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const before = content.slice(0, cursor).replace(/@([a-zA-Z0-9._\-\s]*)$/, `@${handle} `);
    const after = content.slice(cursor);
    setContent(before + after);
    setMentionOpen(false);
    setMentionSearch(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  if (!canComment || isClosed) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), commentScope: "GENERAL" }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to post comment.");
        return;
      }
      setContent("");
      toast.addToast("success", "Comment added.");
      await onRefresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CardRoot>
      <CardHeader>
        <h2 className="text-sm font-semibold text-(--text-primary)">Add comment</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-xs text-(--color-danger)">{error}</p>}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder="Write a comment… Use @ to mention someone"
              rows={3}
              maxLength={5000}
              disabled={submitting}
            />
            {mentionOpen && filteredMentions.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-(--border-subtle) bg-(--bg-surface) shadow-lg">
                {filteredMentions.slice(0, 8).map((u) => (
                  <button
                    key={u.user.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(u.user);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-(--bg-surface-elev)"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--bg-surface-elev) text-xs font-semibold text-(--text-muted) uppercase">
                      {(u.user.name ?? u.user.email ?? "?")[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-(--text-primary)">
                        {u.user.name ?? u.user.email}
                      </p>
                      {u.user.name && u.user.email && (
                        <p className="truncate text-xs text-(--text-muted)">{u.user.email}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-(--text-muted)">Use @ to mention a team member</p>
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {submitting && <Spinner size="sm" />}
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      </CardContent>
    </CardRoot>
  );
}

function AddEvidenceSection({
  recordId,
  isClosed,
  canAdd,
  onRefresh,
}: {
  recordId: string;
  isClosed: boolean;
  canAdd: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"idle" | "link" | "uploading">("idle");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canAdd || isClosed) return null;

  async function uploadFile(file: File) {
    setMode("uploading");
    setUploadProgress("Preparing upload…");
    setError(null);
    try {
      const mimeType = resolveMimeType(file);
      const urlRes = await apiFetch(`/api/records/${recordId}/evidence/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          sizeBytes: Math.max(file.size, 0),
        }),
        showToastOnError: false,
      });
      if (!urlRes.ok) {
        const json = (await urlRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to prepare upload.");
        setMode("idle");
        return;
      }
      const urlJson = (await urlRes.json()) as {
        data: { uploadUrl: string; objectKey: string };
      };
      const { uploadUrl, objectKey } = urlJson.data;

      setUploadProgress("Uploading…");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mimeType },
      });
      if (!uploadRes.ok) {
        setError("Upload failed. Please try again.");
        setMode("idle");
        return;
      }

      setUploadProgress("Saving…");
      const confirmRes = await apiFetch(`/api/records/${recordId}/evidence/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,
          fileName: file.name,
          mimeType,
          sizeBytes: Math.max(file.size, 0),
          label: file.name,
        }),
        showToastOnError: false,
      });
      if (!confirmRes.ok) {
        const json = (await confirmRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to save.");
        setMode("idle");
        return;
      }
      toast.addToast("success", "File uploaded.");
      setMode("idle");
      await onRefresh();
    } catch {
      setError("Upload failed.");
      setMode("idle");
    } finally {
      setUploadProgress(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = "";
  }

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (mode === "uploading" || !canAdd || isClosed) return;
      const imageItem = Array.from(e.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith("image/")
      );
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      void uploadFile(
        new File([file], `screenshot-${Date.now()}.png`, { type: "image/png" })
      );
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [mode, canAdd, isClosed]);

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceType: "LINK",
          label: label.trim(),
          url: url.trim(),
        }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to add link.");
        return;
      }
      setLabel("");
      setUrl("");
      setMode("idle");
      toast.addToast("success", "Link added.");
      await onRefresh();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {error && <p className="text-xs text-(--color-danger)">{error}</p>}

      {mode === "uploading" && (
        <div className="flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm text-(--text-muted)">
          <Spinner size="sm" />
          {uploadProgress ?? "Uploading…"}
        </div>
      )}

      {mode === "link" && (
        <form
          onSubmit={handleAddLink}
          className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-(--text-primary)">
              Label <span className="text-(--color-danger)">*</span>
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Invoice #1234"
              maxLength={255}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-(--text-primary)">
              URL <span className="text-(--color-danger)">*</span>
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              maxLength={2048}
              disabled={submitting}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !label.trim() || !url.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 text-xs font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {submitting && <Spinner size="sm" />}
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="inline-flex h-8 items-center rounded-lg border border-(--border-subtle) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "idle" && (
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-5 text-center transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-soft)"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void uploadFile(f);
          }}
        >
          <IconUpload size={18} className="text-(--text-muted)" />
          <div>
            <p className="text-sm font-medium text-(--text-primary)">
              Drop files here, click to upload, or paste (Ctrl/Cmd+V)
            </p>
            <p className="mt-0.5 text-xs text-(--text-muted)">
              Images, PDF, Word, Excel, CSV · Max 25 MB
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMode("link");
            }}
            className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
          >
            <IconPlus size={11} />
            Add link instead
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        onChange={handleFileChange}
      />
    </div>
  );
}

function LinkedSection({
  links,
  currentRecordId,
  canLink,
  isClosed,
  onOpenLink,
}: {
  links: RecordLinkItem[];
  currentRecordId: string;
  canLink: boolean;
  isClosed: boolean;
  onOpenLink: () => void;
}) {
  return (
    <CardRoot>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-(--text-primary)">
            Linked requests
            {links.length > 0 && (
              <span className="ml-1.5 font-normal text-(--text-muted)">({links.length})</span>
            )}
          </h2>
          {canLink && !isClosed && (
            <button
              type="button"
              onClick={onOpenLink}
              className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              <IconPlus size={12} />
              Link
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No related requests have been linked yet.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => {
              const otherId = l.fromRecordId === currentRecordId ? l.toRecordId : l.fromRecordId;
              const typeLabel = RECORD_LINK_TYPE_LABELS[l.linkType] ?? l.linkType;
              const fromHere = l.fromRecordId === currentRecordId;
              const directionText = fromHere
                ? `This request → ${typeLabel} →`
                : `→ ${typeLabel} → this request`;
              return (
                <li key={l.id}>
                  <Link
                    href={`/app/requests/${otherId}`}
                    className="flex flex-col gap-0.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
                  >
                    <span className="flex items-center gap-2">
                      <IconLink size={13} className="shrink-0 text-(--text-muted)" />
                      <span className="text-xs text-(--text-muted)">{directionText}</span>
                    </span>
                    <span className="truncate pl-5 font-mono text-xs text-(--color-primary)">
                      {otherId}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </CardRoot>
  );
}

function PaymentSection({
  payment,
  missingProof,
  canManage,
  canRemoveEvidence,
  isClosed,
  recordId,
  onOpenSetStatus,
  onRefresh,
}: {
  payment: RecordPaymentItem;
  missingProof: boolean;
  canManage: boolean;
  canRemoveEvidence: boolean;
  isClosed: boolean;
  recordId: string;
  onOpenSetStatus: () => void;
  onRefresh: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addMode, setAddMode] = useState<"idle" | "text" | "link">("idle");
  const [noteContent, setNoteContent] = useState("");
  const [noteLabel, setNoteLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  function resetAddForm() {
    setAddMode("idle");
    setAddError(null);
    setNoteContent("");
    setNoteLabel("");
    setLinkUrl("");
    setLinkLabel("");
  }

  async function uploadFile(file: File) {
    setSubmitting(true);
    setUploadProgress("Preparing...");
    setAddError(null);
    try {
      const mimeType = resolveMimeType(file);
      const urlRes = await apiFetch(`/api/records/${recordId}/payment/evidence/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          sizeBytes: Math.max(file.size, 0),
        }),
        showToastOnError: false,
      });
      if (!urlRes.ok) {
        const json = (await urlRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setAddError(json.error?.message ?? "Failed to prepare upload.");
        return;
      }
      const urlJson = (await urlRes.json()) as {
        data: { uploadUrl: string; objectKey: string };
      };
      const { uploadUrl, objectKey } = urlJson.data;

      setUploadProgress("Uploading...");
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mimeType },
      });
      if (!putRes.ok) {
        setAddError("Upload failed. Please try again.");
        return;
      }

      setUploadProgress("Saving...");
      const confirmRes = await apiFetch(`/api/records/${recordId}/payment/evidence/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,
          fileName: file.name,
          mimeType,
          sizeBytes: Math.max(file.size, 0),
          label: file.name,
        }),
        showToastOnError: false,
      });
      if (!confirmRes.ok) {
        const json = (await confirmRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setAddError(json.error?.message ?? "Failed to save.");
        return;
      }
      toast.addToast("success", "File uploaded.");
      await onRefresh();
    } catch {
      setAddError("Upload failed.");
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAddError(null);
    try {
      const body =
        addMode === "text"
          ? {
              evidenceType: "TEXT" as const,
              contentText: noteContent.trim(),
              label: noteLabel.trim() || undefined,
            }
          : {
              evidenceType: "LINK" as const,
              url: linkUrl.trim(),
              label: linkLabel.trim(),
            };

      const res = await apiFetch(`/api/records/${recordId}/payment/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setAddError(json.error?.message ?? "Failed to add proof.");
        return;
      }
      toast.addToast("success", "Payment proof added.");
      resetAddForm();
      await onRefresh();
    } catch {
      setAddError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CardRoot>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-(--text-primary)">Payment</h2>
          {canManage && !isClosed && (
            <button
              type="button"
              onClick={onOpenSetStatus}
              className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              Update status
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {payment ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={PAYMENT_STATUS_BADGE[payment.status] ?? "secondary"}>
                {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
              </Badge>
              {missingProof && (
                <span className="inline-flex items-center gap-1 rounded-full bg-(--color-warning-soft) px-2 py-0.5 text-xs text-(--color-warning)">
                  <IconAlertCircle size={11} />
                  Missing proof
                </span>
              )}
            </div>

            {payment.evidence.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-(--text-muted)">
                  Payment proof ({payment.evidence.length})
                </p>
                <ul className="space-y-1.5">
                  {payment.evidence.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-center gap-2 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-(--text-primary)">
                          {ev.label ?? `Proof v${ev.versionNumber}`}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {ev.evidenceType} · {formatDate(ev.createdAt)}
                        </p>
                      </div>
                      {canRemoveEvidence && !isClosed && (
                        <RemovePaymentEvidenceButton
                          evidenceId={ev.id}
                          recordId={recordId}
                          onSuccess={onRefresh}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canManage && !isClosed && (
              <div className="space-y-2">
                {addMode === "idle" && addError && (
                  <p className="text-xs text-(--color-danger)">{addError}</p>
                )}

                {submitting && uploadProgress && (
                  <div className="flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-xs text-(--text-muted)">
                    <Spinner size="sm" />
                    {uploadProgress}
                  </div>
                )}

                {addMode === "idle" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitting}
                      className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-50"
                    >
                      <IconUpload size={12} />
                      Upload file
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddMode("text")}
                      disabled={submitting}
                      className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-50"
                    >
                      + Add note
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddMode("link")}
                      disabled={submitting}
                      className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-50"
                    >
                      + Add link
                    </button>
                  </div>
                )}

                {addMode !== "idle" && (
                  <form
                    onSubmit={handleAddEvidence}
                    className="space-y-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3"
                  >
                    {addError && (
                      <p className="text-xs text-(--color-danger)">{addError}</p>
                    )}

                    {addMode === "text" && (
                      <>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-(--text-primary)">
                            Note <span className="text-(--color-danger)">*</span>
                          </label>
                          <Textarea
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            placeholder="Payment confirmation details..."
                            rows={3}
                            maxLength={5000}
                            disabled={submitting}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-(--text-primary)">
                            Label{" "}
                            <span className="font-normal text-(--text-muted)">(optional)</span>
                          </label>
                          <Input
                            value={noteLabel}
                            onChange={(e) => setNoteLabel(e.target.value)}
                            placeholder="e.g. Wire transfer confirmed"
                            maxLength={255}
                            disabled={submitting}
                          />
                        </div>
                      </>
                    )}

                    {addMode === "link" && (
                      <>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-(--text-primary)">
                            Label <span className="text-(--color-danger)">*</span>
                          </label>
                          <Input
                            value={linkLabel}
                            onChange={(e) => setLinkLabel(e.target.value)}
                            placeholder="e.g. Bank receipt"
                            maxLength={255}
                            disabled={submitting}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-(--text-primary)">
                            URL <span className="text-(--color-danger)">*</span>
                          </label>
                          <Input
                            type="url"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="https://..."
                            maxLength={2048}
                            disabled={submitting}
                          />
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={
                          submitting ||
                          (addMode === "text" && !noteContent.trim()) ||
                          (addMode === "link" && (!linkUrl.trim() || !linkLabel.trim()))
                        }
                        className="inline-flex h-7 items-center gap-1.5 rounded bg-(--color-primary) px-3 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {submitting && <Spinner size="sm" />}
                        {submitting ? "Saving..." : "Add proof"}
                      </button>
                      <button
                        type="button"
                        onClick={resetAddForm}
                        className="inline-flex h-7 items-center rounded border border-(--border-subtle) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-(--text-muted)">No payment information recorded.</p>
            {canManage && !isClosed && (
              <button
                type="button"
                onClick={onOpenSetStatus}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
              >
                Set payment status
              </button>
            )}
          </div>
        )}
      </CardContent>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          e.target.value = "";
        }}
      />
    </CardRoot>
  );
}

function RemovePaymentEvidenceButton({
  evidenceId,
  recordId,
  onSuccess,
}: {
  evidenceId: string;
  recordId: string;
  onSuccess: () => void | Promise<void>;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded px-2 py-1 text-xs text-(--color-danger) opacity-60 transition-opacity hover:opacity-100"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="text-xs text-(--text-muted)">Remove?</span>
      <button
        type="button"
        onClick={async () => {
          setLoading(true);
          try {
            const res = await apiFetch(
              `/api/records/${recordId}/payment/evidence/${evidenceId}`,
              {
                method: "DELETE",
                showToastOnError: false,
              }
            );
            if (!res.ok) {
              const json = (await res.json().catch(() => ({}))) as {
                error?: { message?: string };
              };
              toast.addToast("error", json.error?.message ?? "Failed to remove.");
              setConfirming(false);
              return;
            }
            toast.addToast("success", "Proof removed.");
            await onSuccess();
          } catch {
            toast.addToast("error", "Network error.");
          } finally {
            setLoading(false);
            setConfirming(false);
          }
        }}
        disabled={loading}
        className="rounded px-1.5 py-0.5 text-xs font-medium text-(--color-danger) transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {loading ? "…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded px-1.5 py-0.5 text-xs text-(--text-muted) transition-opacity hover:opacity-80"
      >
        No
      </button>
    </div>
  );
}

function RequestDetailSkeleton() {
  return (
    <div className="space-y-6 px-4 py-4 sm:px-6">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * AllActionBanners — shows ALL applicable action banners simultaneously
 * so the user can see everything that needs attention at once.
 */
function AllActionBanners({
  rec,
  participants,
  evidence,
  currentUserId,
  canAssignInternal,
  canAssignExternal,
  canAddEvidence,
  onOpenAssignInternal,
  onApprove,
  onReject,
  actionLoading,
  onScrollToSection,
}: {
  rec: RecordDetailExtended;
  participants: RecordParticipant[];
  evidence: RecordEvidenceItem[];
  currentUserId: string;
  canAssignInternal: boolean;
  canAssignExternal: boolean;
  canAddEvidence: boolean;
  onOpenAssignInternal: () => void;
  onApprove: (participantId: string) => void;
  onReject: (participantId: string) => void;
  actionLoading: string | null;
  onScrollToSection: (sectionId: string) => void;
}) {
  if (["CLOSED", "CANCELED", "APPROVED", "REJECTED"].includes(rec.status)) return null;

  const approverParticipants = participants.filter((p) => p.participantRole === "APPROVER");
  const myPendingApprovals = participants.filter(
    (p) =>
      p.participantRole === "APPROVER" &&
      p.status === "PENDING" &&
      p.participantType === "INTERNAL" &&
      p.userId === currentUserId
  );

  const banners: ReactNode[] = [];

  for (const pendingApproval of myPendingApprovals) {
    banners.push(
      <BannerShell key={`approval-${pendingApproval.id}`} tone="primary" icon="⏳">
        <span className="font-semibold text-(--color-primary)">Your approval is needed.</span>
        <span className="text-(--text-secondary)"> Approve or reject this request.</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={actionLoading === pendingApproval.id}
            onClick={() => onApprove(pendingApproval.id)}
            className="cursor-pointer rounded bg-(--color-success-soft) px-3 py-1.5 text-xs font-semibold text-(--color-success) transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {actionLoading === pendingApproval.id ? "..." : "Approve"}
          </button>
          <button
            type="button"
            disabled={actionLoading === pendingApproval.id}
            onClick={() => onReject(pendingApproval.id)}
            className="cursor-pointer rounded bg-(--color-danger-soft) px-3 py-1.5 text-xs font-semibold text-(--color-danger) transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </BannerShell>
    );
  }

  if (rec.status === "DRAFT" && rec.createdByUserId === currentUserId) {
    banners.push(
      <BannerShell key="draft" tone="warning" icon="📝">
        <span className="font-semibold text-(--color-warning)">This is a draft.</span>
        <span className="text-(--text-secondary)"> Submit it to start the approval process.</span>
      </BannerShell>
    );
  }

  if (rec.status === "AWAITING_INFO") {
    banners.push(
      <BannerShell key="awaiting-info" tone="warning" icon="💬">
        <span className="font-semibold text-(--color-warning)">Awaiting additional information.</span>
        <span className="text-(--text-secondary)"> Check the comments section for what&apos;s needed.</span>
        <a
          href="#section-comments"
          className="ml-auto shrink-0 rounded-lg border border-(--color-warning) px-3 py-1.5 text-xs font-semibold text-(--color-warning) transition-colors hover:bg-(--color-warning-soft)"
        >
          View comments →
        </a>
      </BannerShell>
    );
  }

  if (
    approverParticipants.length === 0 &&
    rec.status === "OPEN" &&
    (canAssignInternal || canAssignExternal)
  ) {
    banners.push(
      <BannerShell key="no-approvers" tone="neutral" icon="👤">
        <span className="font-semibold text-(--text-primary)">No approvers assigned yet.</span>
        <span className="text-(--text-secondary)"> Assign someone to move this request forward.</span>
        <button
          type="button"
          onClick={onOpenAssignInternal}
          className="ml-auto shrink-0 cursor-pointer rounded-lg border border-(--border-strong) bg-(--bg-surface) px-3 py-1.5 text-xs font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-hover)"
        >
          Assign approver →
        </button>
      </BannerShell>
    );
  }

  if (evidence.length === 0 && canAddEvidence && rec.status === "OPEN") {
    banners.push(
      <BannerShell key="no-evidence" tone="neutral" icon="📎">
        <span className="font-semibold text-(--text-primary)">No supporting evidence yet.</span>
        <span className="text-(--text-secondary)"> Attach files or links to strengthen this request.</span>
        <button
          type="button"
          onClick={() => onScrollToSection("section-evidence")}
          className="ml-auto shrink-0 cursor-pointer rounded-lg border border-(--border-strong) bg-(--bg-surface) px-3 py-1.5 text-xs font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-hover)"
        >
          Add evidence →
        </button>
      </BannerShell>
    );
  }

  if (rec.overdue && rec.status === "OPEN") {
    banners.push(
      <BannerShell key="overdue" tone="destructive" icon="🔴">
        <span className="font-semibold text-(--color-danger)">This request is overdue.</span>
        <span className="text-(--text-secondary)"> The needed-by date has passed.</span>
      </BannerShell>
    );
  }

  if (
    myPendingApprovals.length === 0 &&
    approverParticipants.some((p) => p.status === "PENDING")
  ) {
    const pending = approverParticipants.filter((p) => p.status === "PENDING");
    const name = pending[0]?.name ?? pending[0]?.email ?? "approver";
    banners.push(
      <BannerShell key="waiting" tone="neutral" icon="⏳">
        <span className="text-(--text-secondary)">
          Waiting for approval from{" "}
          <span className="font-semibold text-(--text-primary)">{name}</span>
          {pending.length > 1
            ? ` and ${pending.length - 1} other${pending.length - 1 > 1 ? "s" : ""}`
            : ""}
          .
        </span>
      </BannerShell>
    );
  }

  if (banners.length === 0) return null;

  return <div className="space-y-2">{banners}</div>;
}

function BannerShell({
  tone,
  icon,
  children,
}: {
  tone: "primary" | "warning" | "destructive" | "neutral";
  icon: string;
  children: ReactNode;
}) {
  const styles = {
    primary: "border-(--color-primary-soft) bg-(--color-primary-soft)",
    warning: "border-(--color-warning-soft) bg-(--color-warning-soft)",
    destructive: "border-(--color-danger-soft) bg-(--color-danger-soft)",
    neutral: "border-(--border-subtle) bg-(--bg-surface-elev)",
  };
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-1 duration-200 ${styles[tone]}`}
    >
      <span className="text-base" role="img" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}

/**
 * RequestKeyboardNav — enables Alt+← / Alt+→ (or J/K in list context) to navigate
 * between requests. Reads the navigation list from sessionStorage key
 * `rlt_request_nav_list` (set by the list page when navigating to a detail).
 * Renders a subtle prev/next indicator in the top-right of the page.
 */
export function RequestKeyboardNav({
  currentId,
  onNavigate,
}: {
  currentId: string;
  onNavigate?: (id: string, key?: string | null) => void;
}) {
  const router = useRouter();
  const [navList, setNavList] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("rlt_request_nav_list");
      if (raw) setNavList(JSON.parse(raw) as string[]);
    } catch {
      // ignore
    }
  }, []);

  const currentIndex = navList.indexOf(currentId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < navList.length - 1;
  const prevId = hasPrev ? navList[currentIndex - 1] : null;
  const nextId = hasNext ? navList[currentIndex + 1] : null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.altKey && e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        if (onNavigate) {
          onNavigate(prevId);
        } else {
          router.push(`/app/requests/${prevId}`);
        }
      }
      if (e.altKey && e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        if (onNavigate) {
          onNavigate(nextId);
        } else {
          router.push(`/app/requests/${nextId}`);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prevId, nextId, router, onNavigate]);

  if (navList.length === 0 || currentIndex === -1) return null;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() =>
          prevId &&
          (onNavigate ? onNavigate(prevId) : router.push(`/app/requests/${prevId}`))
        }
        disabled={!hasPrev}
        title="Previous request (Alt + ←)"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-30"
      >
        ←
      </button>
      <span className="min-w-[3rem] text-center text-xs text-(--text-muted)">
        {currentIndex + 1} / {navList.length}
      </span>
      <button
        type="button"
        onClick={() =>
          nextId &&
          (onNavigate ? onNavigate(nextId) : router.push(`/app/requests/${nextId}`))
        }
        disabled={!hasNext}
        title="Next request (Alt + →)"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-30"
      >
        →
      </button>
    </div>
  );
}
