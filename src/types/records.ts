export type RecordStatus =
  | "OPEN"
  | "CLOSED"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "NO_RESPONSE";

export type RecordType = "SCOPE_CHANGE" | "DECISION" | "BUDGET";

export type RecordListItem = {
  id: string;
  title: string;
  type: RecordType;
  status: RecordStatus;
  amount: number | null;
  currency: string | null;
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
  commentScope: "GENERAL" | "APPROVAL" | "PAYMENT";
  content: string;
  isCritical: boolean;
  createdAt: string;
};

export type RecordLinkItem = {
  id: string;
  linkType: "FULFILLS" | "RELATED";
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
    record: RecordDetail;
    evidence: RecordEvidenceItem[];
    participants: RecordParticipant[];
    timeline: RecordEventItem[];
    comments: RecordComment[];
    links: RecordLinkItem[];
    payment: RecordPaymentItem;
    missingProof: boolean;
  };
};
