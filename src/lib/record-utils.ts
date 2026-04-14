import type { RecordStatus, RecordType } from "@/types/records";

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  SCOPE_CHANGE: "Scope Change",
  DECISION: "Decision",
  BUDGET: "Budget",
};

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NO_RESPONSE: "No Response",
};

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "secondary";

export const RECORD_STATUS_BADGE: Record<RecordStatus, BadgeVariant> = {
  OPEN: "default",
  CLOSED: "secondary",
  DRAFT: "secondary",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  NO_RESPONSE: "secondary",
};

export function formatAmount(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  const cur = currency ?? "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const RECORD_EVENT_LABELS: Record<string, string> = {
  RECORD_CREATED: "Request created",
  RECORD_CLOSED: "Request closed",
  APPROVAL_REQUESTED: "Approver assigned",
  APPROVAL_APPROVED: "Approved",
  APPROVAL_REJECTED: "Rejected",
  APPROVAL_LINK_OPENED: "Approval link opened",
  EVIDENCE_FILE_ADDED: "File added",
  EVIDENCE_FILE_REMOVED: "File removed",
  EVIDENCE_LINK_ADDED: "Link added",
  EVIDENCE_LINK_REMOVED: "Link removed",
  COMMENT_ADDED: "Comment added",
  USER_MENTIONED: "User mentioned",
  RECORD_SHARED: "Shared with user",
  RECORD_LINKED: "Linked to request",
  RECORD_UNLINKED: "Link removed",
  PAYMENT_STATUS_SET: "Payment status updated",
  PAYMENT_EVIDENCE_ADDED: "Payment proof added",
  PAYMENT_EVIDENCE_REMOVED: "Payment proof removed",
  REMINDER_SENT: "Reminder sent",
  EXPORT_PDF_GENERATED: "PDF exported",
  EXPORT_BUNDLE_GENERATED: "Bundle exported",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  NOT_PAID: "Not paid",
  PENDING: "Pending",
  PAID: "Paid",
};

export const PAYMENT_STATUS_BADGE: Record<string, BadgeVariant> = {
  NOT_PAID: "secondary",
  PENDING: "warning",
  PAID: "success",
};
