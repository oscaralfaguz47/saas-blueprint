import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  canAccessRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  recomputeApprovalStatus: vi.fn(),
  sendEmail: vi.fn(),
  userFindUnique: vi.fn(),
  recordFindFirst: vi.fn(),
  recordFindUnique: vi.fn(),
  recordParticipantFindFirst: vi.fn(),
  recordParticipantUpdate: vi.fn(),
  $transaction: vi.fn(),
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

vi.mock("@/server/security/request-authorization", () => ({
  canAccessRequest: mocks.canAccessRequest,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/server/services/record-approval-status", () => ({
  recomputeApprovalStatus: mocks.recomputeApprovalStatus,
}));

vi.mock("@/server/services/invitation-email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    APP_NAME: "Test",
    EMAIL_FROM_NOTIFICATIONS: "notifications@test.example",
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    record: { findFirst: mocks.recordFindFirst, findUnique: mocks.recordFindUnique },
    recordParticipant: {
      findFirst: mocks.recordParticipantFindFirst,
      update: mocks.recordParticipantUpdate,
    },
    $transaction: mocks.$transaction,
  },
}));

import { POST as POST_EXTERNAL_PARTICIPANT } from "@/app/api/records/[id]/participants/external/route";
import { POST as POST_EXTERNAL_ACTION } from "@/app/api/v1/external/approvals/[token]/route";

const recordId = "clxxxxxxxxxxxxxxxxxxxxx1";
const tenantId = "clxxxxxxxxxxxxxxxxxxxxx2";
const participantId = "clxxxxxxxxxxxxxxxxxxxxx3";
const sessionUserId = "clxxxxxxxxxxxxxxxxxxxxx4";
const token = "a".repeat(64);

function authSession() {
  return {
    user: {
      id: sessionUserId,
      authLevel: "FULL",
      totpEnabled: false,
      mfaVerified: true,
    },
  };
}

describe("external approval API + reconciler guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue(authSession());
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.getDefaultTenantForUser.mockResolvedValue({ tenant: { id: tenantId } });
    mocks.canAccessRequest.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.recomputeApprovalStatus.mockResolvedValue({
      previousStatus: "WAITING_FOR_APPROVAL",
      newStatus: "FULLY_APPROVED",
      changed: true,
      isTerminalTransition: true,
    });
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.userFindUnique.mockResolvedValue({
      isPlatformBlocked: false,
      email: "creator@x.test",
    });
    mocks.recordFindFirst.mockResolvedValue({
      status: "OPEN",
      createdByUserId: sessionUserId,
    });
    mocks.recordFindUnique.mockResolvedValue({ title: "T", recordKey: "REQ-1" });
    mocks.recordParticipantFindFirst.mockResolvedValue(null);
  });

  describe("POST /api/records/[id]/participants/external", () => {
    it("does not call recomputeApprovalStatus for external VIEWER", async () => {
      const innerTx = {
        recordParticipant: {
          create: vi.fn().mockResolvedValue({
            id: participantId,
            email: "ext@x.test",
            status: "PENDING",
            expiresAt: new Date("2026-02-01T00:00:00.000Z"),
            createdAt: new Date(),
          }),
        },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      const req = new Request("http://localhost/api/ext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ext@x.test",
          participantRole: "VIEWER",
          expiresInHours: 72,
        }),
      });

      const res = await POST_EXTERNAL_PARTICIPANT(req, {
        params: Promise.resolve({ id: recordId }),
      });

      expect(res.status).toBe(201);
      expect(mocks.recomputeApprovalStatus).not.toHaveBeenCalled();
    });

    it("calls recomputeApprovalStatus for external APPROVER", async () => {
      const innerTx = {
        recordParticipant: {
          create: vi.fn().mockResolvedValue({
            id: participantId,
            email: "ext@x.test",
            status: "PENDING",
            expiresAt: new Date("2026-02-01T00:00:00.000Z"),
            createdAt: new Date(),
          }),
        },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      const req = new Request("http://localhost/api/ext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ext@x.test",
          participantRole: "APPROVER",
          expiresInHours: 72,
        }),
      });

      const res = await POST_EXTERNAL_PARTICIPANT(req, {
        params: Promise.resolve({ id: recordId }),
      });

      expect(res.status).toBe(201);
      expect(mocks.recomputeApprovalStatus).toHaveBeenCalledTimes(1);
      expect(mocks.recomputeApprovalStatus).toHaveBeenCalledWith(
        innerTx,
        expect.objectContaining({
          tenantId,
          recordId,
          triggeredByParticipantId: participantId,
          triggeredByAction: "PARTICIPANT_CREATED",
          actorUserId: sessionUserId,
        })
      );
    });
  });

  describe("POST /api/v1/external/approvals/[token]", () => {
    beforeEach(() => {
      mocks.recordParticipantFindFirst.mockResolvedValue({
        id: participantId,
        tenantId,
        recordId,
        email: "ext@x.test",
        status: "PENDING",
        expiresAt: new Date("2027-06-01T00:00:00.000Z"),
        revokedAt: null,
        createdByUserId: sessionUserId,
        record: { createdByUserId: sessionUserId, status: "OPEN" },
      });
    });

    it("does not call recomputeApprovalStatus for COMMENT", async () => {
      mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          recordComment: { create: vi.fn().mockResolvedValue({}) },
          recordEvent: { create: vi.fn().mockResolvedValue({}) },
          recordParticipant: { update: vi.fn().mockResolvedValue({}) },
        })
      );

      const req = new Request("http://localhost/api/v1/ext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "COMMENT", comment: "hello" }),
      });

      await POST_EXTERNAL_ACTION(req, { params: Promise.resolve({ token }) });

      expect(mocks.recomputeApprovalStatus).not.toHaveBeenCalled();
    });

    it("does not call recomputeApprovalStatus for VIEW", async () => {
      mocks.recordParticipantUpdate.mockResolvedValue({});

      const req = new Request("http://localhost/api/v1/ext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "VIEW" }),
      });

      await POST_EXTERNAL_ACTION(req, { params: Promise.resolve({ token }) });

      expect(mocks.recomputeApprovalStatus).not.toHaveBeenCalled();
    });

    it("calls recomputeApprovalStatus after external APPROVE", async () => {
      const innerTx = {
        recordParticipant: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      const req = new Request("http://localhost/api/v1/ext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });

      const res = await POST_EXTERNAL_ACTION(req, { params: Promise.resolve({ token }) });

      expect(res.status).toBe(200);
      expect(mocks.recomputeApprovalStatus).toHaveBeenCalledWith(
        innerTx,
        expect.objectContaining({
          triggeredByAction: "EXTERNAL_APPROVED",
          actorUserId: sessionUserId,
          actorEmail: "ext@x.test",
        })
      );
    });
  });
});
