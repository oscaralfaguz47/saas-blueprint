import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  checkRateLimit: vi.fn(),
  userFindUnique: vi.fn(),
  $transaction: vi.fn(),
  tryConsumeMeter: vi.fn(),
  checkMeterLimit: vi.fn(),
  recordFindFirst: vi.fn(),
  recordEvidenceFindMany: vi.fn(),
  recordParticipantFindMany: vi.fn(),
  recordEventFindMany: vi.fn(),
  recordLinkFindMany: vi.fn(),
  recordPaymentFindFirst: vi.fn(),
  recordCommentFindMany: vi.fn(),
  canAccessRequest: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/server/auth-options", () => ({
  authOptions: {},
}));

vi.mock("@/server/require-full-session", () => ({
  requireFullSession: mocks.requireFullSession,
}));

vi.mock("@/server/services/tenancy", () => ({
  getDefaultTenantForUser: mocks.getDefaultTenantForUser,
}));

vi.mock("@/server/security/tenant-authorization", () => ({
  hasTenantPermission: mocks.hasTenantPermission,
}));

vi.mock("@/server/security/request-authorization", () => ({
  canAccessRequest: mocks.canAccessRequest,
  buildRecordAccessFilter: vi.fn(() => ({})),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/server/billing/try-consume-meter", () => ({
  checkMeterLimit: mocks.checkMeterLimit,
  tryConsumeMeter: mocks.tryConsumeMeter,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.$transaction,
    record: {
      findFirst: mocks.recordFindFirst,
    },
    recordEvidence: { findMany: mocks.recordEvidenceFindMany },
    recordParticipant: { findMany: mocks.recordParticipantFindMany },
    recordEvent: { findMany: mocks.recordEventFindMany },
    recordLink: { findMany: mocks.recordLinkFindMany },
    recordPayment: { findFirst: mocks.recordPaymentFindFirst },
    recordComment: { findMany: mocks.recordCommentFindMany },
  },
}));

import { GET as GET_RECORD } from "@/app/api/records/[id]/route";
import { POST as POST_RECORDS } from "@/app/api/records/route";

function buildPostRecords(body: unknown) {
  return new Request("http://localhost/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const minimalRecordRow = {
  id: "clxxxxxxxxxxxxxxxxxxxxx1",
  title: "Test",
  type: "BUDGET" as const,
  status: "OPEN" as const,
  description: null,
  clientName: null,
  clientEmail: null,
  visibility: "WORKSPACE" as const,
  isSensitive: false,
  closedAt: null,
  closedByUserId: null,
  createdByUserId: "u1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  recordKey: "REQ-2026-000001",
  requestedAmount: null,
  approvedAmount: null,
  currencyCode: null,
  amountIsEstimated: false,
  isRecurring: false,
  recurrenceNotes: null,
  budgetImpactType: null,
  taxAmount: null,
  taxIncluded: null,
  vendorName: null,
  payeeName: null,
  invoiceNumber: null,
  contractReference: null,
  purchaseOrderRef: null,
  priority: "MEDIUM" as const,
  businessJustification: null,
  departmentId: null,
  costCenterId: null,
  departmentName: null,
  costCenterCode: null,
  department: null,
  costCenter: null,
  neededByDate: null,
  submittedAt: null,
  approvedAt: null,
  firstResponseAt: null,
  hasPolicyException: false,
  policyExceptionReason: null,
  isOverBudget: false,
  missingRequiredEvidence: false,
  possibleDuplicate: false,
  riskLevel: null,
  requiresFinanceReview: false,
  closeReason: null,
  closeReasonNotes: null,
  approvalStatus: "NOT_STARTED" as const,
  overdue: false,
};

describe("POST /api/records legacy field rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "u1",
        authLevel: "FULL",
        totpEnabled: false,
        mfaVerified: true,
      },
    });
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.getDefaultTenantForUser.mockResolvedValue({ tenant: { id: "t1" } });
    mocks.hasTenantPermission.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  });

  it("returns 400 LEGACY_FIELD_REMOVED when body contains amount", async () => {
    const res = await POST_RECORDS(
      buildPostRecords({
        title: "Hello",
        type: "BUDGET",
        amount: 100,
      })
    );
    const body = (await res.json()) as { error?: { code?: string; details?: { field?: string } } };

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("LEGACY_FIELD_REMOVED");
    expect(body.error?.details?.field).toBe("amount");
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 LEGACY_FIELD_REMOVED when body contains currency", async () => {
    const res = await POST_RECORDS(
      buildPostRecords({
        title: "Hello",
        type: "BUDGET",
        currency: "USD",
      })
    );
    const body = (await res.json()) as { error?: { code?: string; details?: { field?: string } } };

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("LEGACY_FIELD_REMOVED");
    expect(body.error?.details?.field).toBe("currency");
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });
});

describe("GET /api/records/[id] response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "u1",
        authLevel: "FULL",
        totpEnabled: false,
        mfaVerified: true,
      },
    });
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.getDefaultTenantForUser.mockResolvedValue({ tenant: { id: "t1" } });
    mocks.canAccessRequest.mockResolvedValue(true);
    mocks.recordFindFirst.mockResolvedValue(minimalRecordRow);
    mocks.recordEvidenceFindMany.mockResolvedValue([]);
    mocks.recordParticipantFindMany.mockResolvedValue([]);
    mocks.recordEventFindMany.mockResolvedValue([]);
    mocks.recordLinkFindMany.mockResolvedValue([]);
    mocks.recordPaymentFindFirst.mockResolvedValue(null);
    mocks.recordCommentFindMany.mockResolvedValue([]);
  });

  it("does not include amount or currency on record", async () => {
    const res = await GET_RECORD(new Request("http://localhost/api/records/x"), {
      params: Promise.resolve({ id: "clxxxxxxxxxxxxxxxxxxxxx1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data?: { record?: Record<string, unknown> };
    };
    const rec = json.data?.record;
    expect(rec).toBeDefined();
    expect(rec).not.toHaveProperty("amount");
    expect(rec).not.toHaveProperty("currency");
    expect(rec).toHaveProperty("requestedAmount");
    expect(rec).toHaveProperty("currencyCode");
  });
});
