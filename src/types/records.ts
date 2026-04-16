export type RecordStatus =
  | "OPEN"
  | "CLOSED"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "NO_RESPONSE"
  | "IN_REVIEW"
  | "AWAITING_INFO"
  | "CANCELED";

export type RecordType =
  | "SCOPE_CHANGE"
  | "DECISION"
  | "BUDGET"
  | "BUDGET_REQUEST"
  | "SPEND_APPROVAL"
  | "VENDOR_PAYMENT_REQUEST"
  | "REIMBURSEMENT"
  | "FINANCIAL_EXCEPTION"
  | "CONTRACT_SCOPE_CHANGE"
  | "FORECAST_ADJUSTMENT"
  | "OTHER_FINANCIAL_REQUEST";

export type RecordPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type RecordBudgetImpactType =
  | "NEW_SPEND"
  | "BUDGET_REALLOCATION"
  | "OVER_BUDGET"
  | "NO_BUDGET_IMPACT"
  | "UNKNOWN";

export type RecordRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RecordCloseReason =
  | "APPROVED_AND_COMPLETED"
  | "REJECTED"
  | "WITHDRAWN_BY_REQUESTER"
  | "DUPLICATE"
  | "SUPERSEDED"
  | "NO_ACTION_REQUIRED"
  | "PAID_OR_SETTLED"
  | "CANCELED"
  | "OTHER";

export type RecordApprovalStatus =
  | "NOT_STARTED"
  | "NO_APPROVERS_ASSIGNED"
  | "WAITING_FOR_APPROVAL"
  | "FULLY_APPROVED"
  | "APPROVAL_REJECTED"
  | "APPROVAL_EXPIRED";

export type RecordEvidenceCategory =
  | "INVOICE"
  | "QUOTE"
  | "RECEIPT"
  | "CONTRACT"
  | "STATEMENT_OF_WORK"
  | "APPROVAL_MEMO"
  | "SUPPORTING_SPREADSHEET"
  | "SCREENSHOT"
  | "OTHER";

export type RecordLinkType =
  | "FULFILLS"
  | "RELATED"
  | "BLOCKED_BY"
  | "DUPLICATE_OF"
  | "CHILD_OF"
  | "PARENT_OF"
  | "AMENDS"
  | "SUPERSEDES"
  | "FUNDED_BY"
  | "TRIGGERED_BY";

export type TenantDepartment = {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
};

export type TenantCostCenter = {
  id: string;
  tenantId: string;
  departmentId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
};

export type RecordListItem = {
  id: string;
  title: string;
  type: RecordType;
  status: RecordStatus;
  amount: number | null;
  currency: string | null;
  // New fields from Phase 1
  requestedAmount?: number | null;
  currencyCode?: string | null;
  priority?: RecordPriority;
  neededByDate?: string | null;
  approvalStatus?: RecordApprovalStatus;
  overdue?: boolean;
  hasPolicyException?: boolean;
  recordKey?: string | null;
  // Existing derived fields
  createdByUserId: string;
  createdAt: string;
  hasCriticalComment: boolean;
  hasUnreadMention: boolean;
};

export type RecordDetail = {
  id: string;
  title: string;
  type: RecordType;
  status: RecordStatus;
  description: string | null;
  clientName: string | null;
  clientEmail: string | null;
  amount: number | null;
  currency: string | null;
  visibility: "WORKSPACE" | "RESTRICTED";
  isSensitive: boolean;
  closedAt: string | null;
  closedByUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type RecordDetailExtended = RecordDetail & {
  recordKey: string | null;
  requestedAmount: number | null;
  approvedAmount: number | null;
  currencyCode: string | null;
  amountIsEstimated: boolean;
  isRecurring: boolean;
  recurrenceNotes: string | null;
  budgetImpactType: RecordBudgetImpactType | null;
  taxAmount: number | null;
  taxIncluded: boolean | null;
  vendorName: string | null;
  payeeName: string | null;
  invoiceNumber: string | null;
  contractReference: string | null;
  purchaseOrderRef: string | null;
  priority: RecordPriority;
  businessJustification: string | null;
  departmentId: string | null;
  costCenterId: string | null;
  costCenter: {
    id: string;
    code: string;
    name: string;
    department: { id: string; name: string } | null;
  } | null;
  department: { id: string; name: string; code: string | null } | null;
  departmentName: string | null;
  costCenterCode: string | null;
  neededByDate: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  firstResponseAt: string | null;
  hasPolicyException: boolean;
  policyExceptionReason: string | null;
  isOverBudget: boolean;
  missingRequiredEvidence: boolean;
  possibleDuplicate: boolean;
  riskLevel: RecordRiskLevel | null;
  requiresFinanceReview: boolean;
  closeReason: RecordCloseReason | null;
  closeReasonNotes: string | null;
  approvalStatus: RecordApprovalStatus;
  overdue: boolean;
};

export type ApiListResponse<T> = {
  data: {
    records: T[];
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type ParticipantType = "INTERNAL" | "EXTERNAL";
export type ParticipantRole = "APPROVER" | "VIEWER";
export type ParticipantStatus = "PENDING" | "APPROVED" | "REJECTED";

export type RecordParticipant = {
  id: string;
  participantType: ParticipantType;
  participantRole: ParticipantRole;
  status: ParticipantStatus;
  userId: string | null;
  email: string | null;
  name: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  respondedAt: string | null;
  responseReason: string | null;
  createdAt: string;
};

export type RecordEvidenceItem = {
  id: string;
  evidenceType: "FILE" | "LINK";
  label: string | null;
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  createdByUserId: string | null;
  evidenceCategory: RecordEvidenceCategory | null;
  isRequired: boolean;
};

export type RecordEventItem = {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorDisplayEmail: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
};

export type RecordComment = {
  id: string;
  authorType: "INTERNAL" | "EXTERNAL";
  authorUserId: string | null;
  authorEmail: string | null;
  commentScope: "GENERAL" | "APPROVAL" | "PAYMENT" | "INTERNAL";
  content: string;
  isCritical: boolean;
  createdAt: string;
};

export type RecordLinkItem = {
  id: string;
  linkType: RecordLinkType;
  fromRecordId: string;
  toRecordId: string;
  createdAt: string;
  createdByUserId: string | null;
};

export type RecordPaymentItem = {
  id: string;
  status: "NOT_PAID" | "PENDING" | "PAID";
  setAt: string;
  setByUserId: string | null;
  evidence: {
    id: string;
    evidenceType: "FILE" | "LINK" | "TEXT";
    label: string | null;
    versionNumber: number;
    createdAt: string;
  }[];
} | null;

export type RecordDetailResponse = {
  data: {
    record: RecordDetailExtended;
    evidence: RecordEvidenceItem[];
    participants: RecordParticipant[];
    timeline: RecordEventItem[];
    comments: RecordComment[];
    links: RecordLinkItem[];
    payment: RecordPaymentItem;
    missingProof: boolean;
  };
};
