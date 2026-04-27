import type {
  RecordApprovalStatus,
  RecordCloseReason,
  RecordLinkType,
  RecordPriority,
  RecordStatus,
  RecordType,
} from "@/types/records";

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  SCOPE_CHANGE: "Scope Change",
  DECISION: "Decision",
  BUDGET: "Budget",
  BUDGET_REQUEST: "Budget Request",
  SPEND_APPROVAL: "Spend Approval",
  VENDOR_PAYMENT_REQUEST: "Vendor Payment",
  REIMBURSEMENT: "Reimbursement",
  FINANCIAL_EXCEPTION: "Financial Exception",
  CONTRACT_SCOPE_CHANGE: "Contract / Scope Change",
  FORECAST_ADJUSTMENT: "Forecast Adjustment",
  OTHER_FINANCIAL_REQUEST: "Other Financial Request",
};

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NO_RESPONSE: "No Response",
  IN_REVIEW: "In Review",
  AWAITING_INFO: "Awaiting Info",
  CANCELED: "Canceled",
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
  IN_REVIEW: "warning",
  AWAITING_INFO: "warning",
  CANCELED: "secondary",
};

export const RECORD_PRIORITY_LABELS: Record<RecordPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const RECORD_PRIORITY_BADGE: Record<RecordPriority, BadgeVariant> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
};

export const RECORD_APPROVAL_STATUS_LABELS: Record<RecordApprovalStatus, string> = {
  NOT_STARTED: "Not started",
  NO_APPROVERS_ASSIGNED: "No approvers",
  WAITING_FOR_APPROVAL: "Waiting for approval",
  FULLY_APPROVED: "Fully approved",
  APPROVAL_REJECTED: "Approval rejected",
  APPROVAL_EXPIRED: "Approval expired",
};

/** Close reason labels (string map for filtered keys in UI). */
export const RECORD_CLOSE_REASON_LABELS: Record<string, string> = {
  APPROVED_AND_COMPLETED: "Approved and completed",
  REJECTED: "Rejected",
  WITHDRAWN_BY_REQUESTER: "Withdrawn by requester",
  DUPLICATE: "Duplicate",
  SUPERSEDED: "Superseded by another request",
  NO_ACTION_REQUIRED: "No action required",
  PAID_OR_SETTLED: "Paid or settled",
  CANCELED: "Canceled",
  OTHER: "Other",
} satisfies Record<RecordCloseReason, string>;

export const RECORD_LINK_TYPE_LABELS: Record<string, string> = {
  FULFILLS: "Fulfills",
  RELATED: "Related to",
  BLOCKED_BY: "Blocked by",
  DUPLICATE_OF: "Duplicate of",
  CHILD_OF: "Child of",
  PARENT_OF: "Parent of",
  AMENDS: "Amends",
  SUPERSEDES: "Supersedes",
  FUNDED_BY: "Funded by",
  TRIGGERED_BY: "Triggered by",
} satisfies Record<RecordLinkType, string>;

export const RECORD_BUDGET_IMPACT_LABELS: Record<string, string> = {
  NEW_SPEND: "New spend",
  BUDGET_REALLOCATION: "Budget reallocation",
  OVER_BUDGET: "Over budget",
  NO_BUDGET_IMPACT: "No budget impact",
  UNKNOWN: "Unknown",
};

/**
 * Get the best available amount from a list item.
 * Prefers requestedAmount (new field) over amount (legacy field).
 */
export function getBestAmount(item: {
  requestedAmount?: number | null;
  amount?: number | null;
  currencyCode?: string | null;
  currency?: string | null;
}): { amount: number | null; currency: string | null } {
  return {
    amount: item.requestedAmount ?? item.amount ?? null,
    currency: item.currencyCode ?? item.currency ?? null,
  };
}

export function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null) return "—";
  const curr = currency ?? "USD";
  try {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: curr,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // narrowSymbol not supported in all environments, fall back to symbol
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: curr,
        currencyDisplay: "symbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
  } catch {
    return `${curr} ${amount.toFixed(2)}`;
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export const RECORD_EVENT_LABELS: Record<string, string> = {
  RECORD_CREATED: "Request created",
  RECORD_CLOSED: "Request closed",
  APPROVAL_REQUESTED: "Participant assigned",
  APPROVAL_APPROVED: "Request approved",
  APPROVAL_REJECTED: "Request rejected",
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
  REMINDER_SENT: "Reminder sent to approvers",
  EXPORT_PDF_GENERATED: "PDF exported",
  EXPORT_BUNDLE_GENERATED: "Bundle exported",
  PARTICIPANT_VIEWED: "Request viewed",
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
