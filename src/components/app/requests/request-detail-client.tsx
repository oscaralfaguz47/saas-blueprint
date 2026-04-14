"use client";

import { useCallback, useEffect, useState } from "react";
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
            <EvidenceSection evidence={evidence} isClosed={isClosed} />
            <AddEvidenceLinkSection
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

function EvidenceSection({
  evidence,
  isClosed,
}: {
  evidence: RecordEvidenceItem[];
  isClosed: boolean;
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
                      </span>
                      {comment?.isCritical && (
                        <span className="flex items-center gap-1 text-xs text-(--color-danger)">
                          <IconAlertCircle size={11} />
                          Action required
                        </span>
                      )}
                      <span className="text-xs text-(--text-muted)">{formatDate(ev.occurredAt)}</span>
                    </div>
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
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a comment…"
            rows={3}
            maxLength={5000}
            disabled={submitting}
          />
          <div className="flex justify-end">
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

function AddEvidenceLinkSection({
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
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAdd || isClosed) return null;

  async function handleSubmit(e: React.FormEvent) {
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
      setOpen(false);
      toast.addToast("success", "Evidence link added.");
      await onRefresh();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
        >
          <IconPlus size={13} />
          Add link
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4"
        >
          {error && <p className="text-xs text-(--color-danger)">{error}</p>}
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
              {submitting ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={submitting}
              className="inline-flex h-8 items-center rounded-lg border border-(--border-subtle) px-3 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
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
