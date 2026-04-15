"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
} from "@/components/ui/icons";
import { AssignApproverModal } from "./assign-approver-modal";
import { RejectApprovalModal } from "./reject-approval-modal";
import { AssignExternalApproverModal } from "./assign-external-approver-modal";
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
  type BadgeVariant,
} from "@/lib/record-utils";
import type {
  RecordDetail,
  RecordDetailResponse,
  RecordParticipant,
  RecordEvidenceItem,
  RecordEventItem,
  RecordComment,
  RecordLinkItem,
  RecordPaymentItem,
  ParticipantStatus,
} from "@/types/records";

type Props = {
  recordId: string;
  currentUserId: string;
  permissions: string[];
};

function normalizeDetailData(
  raw: RecordDetailResponse["data"] & { record: RecordDetail & { amount?: unknown } }
): RecordDetailResponse["data"] {
  const amountRaw = raw.record.amount as unknown;
  let amount: number | null = null;
  if (amountRaw != null && amountRaw !== "") {
    const n = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
    amount = Number.isFinite(n) ? n : null;
  }
  return {
    ...raw,
    record: { ...raw.record, amount },
  };
}

export function RequestDetailClient({ recordId, currentUserId, permissions }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [data, setData] = useState<RecordDetailResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [assignApproverOpen, setAssignApproverOpen] = useState(false);
  const [assignExternalOpen, setAssignExternalOpen] = useState(false);
  const [setPaymentOpen, setSetPaymentOpen] = useState(false);
  const [linkRecordOpen, setLinkRecordOpen] = useState(false);

  const canClose = permissions.includes("tenant.requests.close");
  const canComment = permissions.includes("tenant.requests.comment");
  const canExport = permissions.includes("tenant.requests.export");
  const canAddEvidence = permissions.includes("tenant.evidence.add");
  const canAssignInternal = permissions.includes("tenant.approvals.assign_internal");
  const canAssignExternal = permissions.includes("tenant.approvals.assign_external");
  const canRemind = permissions.includes("tenant.approvals.remind");
  const canManagePayment = permissions.includes("tenant.payments.manage");
  const canLink = permissions.includes("tenant.requests.link");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}`, {
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
        data: RecordDetailResponse["data"] & { record: RecordDetail & { amount?: unknown } };
      };
      setData(normalizeDetailData(json.data));
    } catch {
      setError("Failed to load request.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleClose() {
    if (!data || closing) return;
    setClosing(true);
    try {
      const res = await apiFetch(`/api/records/${recordId}/close`, {
        method: "POST",
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
  const isClosed = record.status === "CLOSED";

  return (
    <div className="space-y-6">
      <Link
        href="/app/requests"
        className="inline-flex items-center gap-1.5 text-sm text-(--text-muted) transition-colors hover:text-(--text-primary)"
      >
        <IconChevronLeft size={14} />
        Back to requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={RECORD_STATUS_BADGE[record.status]}>
              {RECORD_STATUS_LABELS[record.status]}
            </Badge>
            <span className="rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 text-xs text-(--text-muted)">
              {RECORD_TYPE_LABELS[record.type]}
            </span>
          </div>
          <h1 className="break-words text-xl font-semibold text-(--text-primary)">{record.title}</h1>
          <p className="text-sm text-(--text-muted)">
            Created {formatDate(record.createdAt)}
            {record.closedAt ? ` · Closed ${formatDate(record.closedAt)}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canClose && !isClosed && (
            <button
              type="button"
              onClick={() => void handleClose()}
              disabled={closing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-60"
            >
              {closing && <Spinner size="sm" />}
              {closing ? "Closing…" : "Close request"}
            </button>
          )}
          {record.status === "DRAFT" && record.createdByUserId === currentUserId && (
            <SubmitDraftButton recordId={recordId} onSuccess={load} />
          )}
          {canExport && (
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover)"
            >
              Export PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CardRoot>
            <CardHeader>
              <h2 className="text-sm font-semibold text-(--text-primary)">Details</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {record.description && (
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-(--text-muted) uppercase">
                    Description
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-(--text-secondary)">
                    {record.description}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {record.amount != null && (
                  <DetailField label="Amount" value={formatAmount(record.amount, record.currency)} />
                )}
                {record.clientName && <DetailField label="Client" value={record.clientName} />}
                {record.clientEmail && (
                  <DetailField label="Client email" value={record.clientEmail} />
                )}
              </div>
            </CardContent>
          </CardRoot>

          <div>
            <EvidenceSection evidence={evidence} isClosed={isClosed} recordId={recordId} />
            <AddEvidenceSection
              recordId={recordId}
              isClosed={isClosed}
              canAdd={canAddEvidence}
              onRefresh={load}
            />
          </div>

          <ParticipantsSection
            participants={participants}
            recordId={recordId}
            isClosed={isClosed}
            currentUserId={currentUserId}
            canAssignInternal={canAssignInternal}
            canAssignExternal={canAssignExternal}
            canRemind={canRemind}
            onRefresh={load}
            onOpenAssignInternal={() => setAssignApproverOpen(true)}
            onOpenAssignExternal={() => setAssignExternalOpen(true)}
          />

          <TimelineSection timeline={timeline} comments={comments} />

          <CommentSection
            recordId={recordId}
            isClosed={isClosed}
            canComment={canComment}
            onRefresh={load}
          />
        </div>

        <div className="space-y-6">
          <LinkedSection
            links={links}
            currentRecordId={recordId}
            canLink={canLink}
            isClosed={isClosed}
            onOpenLink={() => setLinkRecordOpen(true)}
          />

          {record.type === "BUDGET" && (
            <PaymentSection
              payment={payment}
              missingProof={missingProof}
              canManage={canManagePayment}
              isClosed={isClosed}
              onOpenSetStatus={() => setSetPaymentOpen(true)}
            />
          )}
        </div>
      </div>

      <AssignApproverModal
        open={assignApproverOpen}
        onClose={() => setAssignApproverOpen(false)}
        recordId={recordId}
        onSuccess={load}
      />
      <AssignExternalApproverModal
        open={assignExternalOpen}
        onClose={() => setAssignExternalOpen(false)}
        recordId={recordId}
        onSuccess={load}
      />
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
}: {
  evidence: RecordEvidenceItem[];
  isClosed: boolean;
  recordId: string;
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
          <p className="text-sm text-(--text-muted)">No evidence attached.</p>
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </CardRoot>
  );
}

function ParticipantsSection({
  participants,
  recordId,
  isClosed,
  currentUserId,
  canAssignInternal,
  canAssignExternal,
  canRemind,
  onRefresh,
  onOpenAssignInternal,
  onOpenAssignExternal,
}: {
  participants: RecordParticipant[];
  recordId: string;
  isClosed: boolean;
  currentUserId: string;
  canAssignInternal: boolean;
  canAssignExternal: boolean;
  canRemind: boolean;
  onRefresh: () => void | Promise<void>;
  onOpenAssignInternal: () => void;
  onOpenAssignExternal: () => void;
}) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const approvers = participants.filter((p) => p.participantRole === "APPROVER");
  const hasPendingApprovers = approvers.some((p) => p.status === "PENDING");

  const statusBadge: Record<ParticipantStatus, BadgeVariant> = {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "destructive",
  };

  async function handleAction(
    participantId: string,
    action: "APPROVE" | "REJECT",
    comment?: string
  ) {
    setActionLoading(participantId);
    try {
      const res = await apiFetch(
        `/api/records/${recordId}/participants/${participantId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, comment }),
          showToastOnError: false,
        }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", json.error?.message ?? "Action failed.");
        return;
      }
      toast.addToast("success", action === "APPROVE" ? "Approved." : "Rejected.");
      await onRefresh();
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setActionLoading(null);
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
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
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
    <CardRoot>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-(--text-primary)">
            Approvals
            {approvers.length > 0 && (
              <span className="ml-1.5 font-normal text-(--text-muted)">
                ({approvers.length})
              </span>
            )}
          </h2>
          {!isClosed && (
            <div className="flex gap-1.5">
              {canRemind && hasPendingApprovers && (
                <button
                  type="button"
                  onClick={() => void handleRemind()}
                  disabled={reminding}
                  className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
                >
                  {reminding ? <Spinner size="sm" /> : null}
                  {reminding ? "Sending…" : "Send reminder"}
                </button>
              )}
              {canAssignExternal && (
                <button
                  type="button"
                  onClick={onOpenAssignExternal}
                  className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                >
                  <IconPlus size={12} />
                  External
                </button>
              )}
              {canAssignInternal && (
                <button
                  type="button"
                  onClick={onOpenAssignInternal}
                  className="inline-flex h-7 items-center gap-1 rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
                >
                  <IconPlus size={12} />
                  Internal
                </button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {approvers.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No approvers assigned.</p>
        ) : (
          <ul className="space-y-3">
            {approvers.map((p) => {
              const isMyApproval =
                p.participantType === "INTERNAL" &&
                p.userId != null &&
                p.userId === currentUserId;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--text-primary)">
                      {p.participantType === "INTERNAL"
                        ? (p.name ?? p.userId ?? "Internal user")
                        : (p.email ?? "External approver")}
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      {p.participantType === "EXTERNAL" ? "External" : "Internal"} ·{" "}
                      {p.respondedAt
                        ? `Responded ${formatDate(p.respondedAt)}`
                        : "Awaiting response"}
                    </p>
                    {p.responseReason && (
                      <p className="mt-1 text-xs text-(--text-secondary) italic">
                        &ldquo;{p.responseReason}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadge[p.status] ?? "default"}>
                      {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                    </Badge>
                    {p.status === "PENDING" && !isClosed && isMyApproval && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={actionLoading === p.id}
                          onClick={() => void handleAction(p.id, "APPROVE")}
                          className="rounded bg-(--color-success-soft) px-2 py-1 text-xs font-medium text-(--color-success) transition-opacity hover:opacity-80 disabled:opacity-50"
                        >
                          {actionLoading === p.id ? <Spinner size="sm" /> : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading === p.id}
                          onClick={() => {
                            setRejectTargetId(p.id);
                            setRejectModalOpen(true);
                          }}
                          className="rounded bg-(--color-danger-soft) px-2 py-1 text-xs font-medium text-(--color-danger) transition-opacity hover:opacity-80 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </CardRoot>
    <RejectApprovalModal
      open={rejectModalOpen}
      onClose={() => {
        setRejectModalOpen(false);
        setRejectTargetId(null);
      }}
      submitting={rejectSubmitting}
      onConfirm={async (reason) => {
        if (!rejectTargetId) return;
        setRejectSubmitting(true);
        try {
          const res = await apiFetch(
            `/api/records/${recordId}/participants/${rejectTargetId}/action`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "REJECT", comment: reason }),
              showToastOnError: false,
            }
          );
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            toast.addToast("error", json.error?.message ?? "Rejection failed.");
            return;
          }
          toast.addToast("success", "Request rejected.");
          setRejectModalOpen(false);
          setRejectTargetId(null);
          await onRefresh();
        } catch {
          toast.addToast("error", "Network error.");
        } finally {
          setRejectSubmitting(false);
        }
      }}
    />
    </>
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
          <p className="text-sm text-(--text-muted)">No activity yet.</p>
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

  function resolveMimeType(file: File): string {
    if (file.type) return file.type;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".txt")) return "text/plain";
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".doc")) return "application/msword";
    if (lower.endsWith(".docx")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
    if (lower.endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return "image/png";
  }

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
          <p className="text-sm text-(--text-muted)">No linked requests.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => {
              const otherId = l.fromRecordId === currentRecordId ? l.toRecordId : l.fromRecordId;
              const direction =
                l.linkType === "FULFILLS"
                  ? l.fromRecordId === currentRecordId
                    ? "Fulfills"
                    : "Fulfilled by"
                  : "Related";
              return (
                <li key={l.id}>
                  <Link
                    href={`/app/requests/${otherId}`}
                    className="flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
                  >
                    <IconLink size={13} className="shrink-0 text-(--text-muted)" />
                    <span className="shrink-0 text-xs text-(--text-muted)">{direction}</span>
                    <span className="truncate text-xs text-(--text-primary)">{otherId}</span>
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
  isClosed,
  onOpenSetStatus,
}: {
  payment: RecordPaymentItem;
  missingProof: boolean;
  canManage: boolean;
  isClosed: boolean;
  onOpenSetStatus: () => void;
}) {
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
      <CardContent className="space-y-3">
        {payment ? (
          <>
            <div className="flex items-center gap-2">
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
              <div>
                <p className="mb-1.5 text-xs font-medium text-(--text-muted)">
                  Payment proof ({payment.evidence.length})
                </p>
                <ul className="space-y-1.5">
                  {payment.evidence.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 py-2 text-xs text-(--text-secondary)"
                    >
                      {ev.label ?? `v${ev.versionNumber}`} · {formatDate(ev.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-(--text-muted)">No payment record.</p>
        )}
      </CardContent>
    </CardRoot>
  );
}

function RequestDetailSkeleton() {
  return (
    <div className="space-y-6">
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
