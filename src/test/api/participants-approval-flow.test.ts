import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  canAccessRequest: vi.fn(),
  userFindUnique: vi.fn(),
  recordFindFirst: vi.fn(),
  recordFindUnique: vi.fn(),
  tenantMembershipFindUnique: vi.fn(),
  recordParticipantFindUnique: vi.fn(),
  recordParticipantFindFirst: vi.fn(),
  $transaction: vi.fn(),
  sendEmail: vi.fn(),
  recomputeApprovalStatus: vi.fn(),
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
    tenantMembership: { findUnique: mocks.tenantMembershipFindUnique },
    recordParticipant: {
      findUnique: mocks.recordParticipantFindUnique,
      findFirst: mocks.recordParticipantFindFirst,
    },
    $transaction: mocks.$transaction,
  },
}));

import { POST as POST_PARTICIPANTS } from "@/app/api/records/[id]/participants/route";
import { POST as POST_ACTION } from "@/app/api/records/[id]/participants/[participantId]/action/route";
import { DELETE as DELETE_PARTICIPANT } from "@/app/api/records/[id]/participants/[participantId]/route";

const recordId = "clxxxxxxxxxxxxxxxxxxxxx1";
const participantId = "clxxxxxxxxxxxxxxxxxxxxx2";
const targetUserId = "clxxxxxxxxxxxxxxxxxxxxx3";
const tenantId = "clxxxxxxxxxxxxxxxxxxxxx4";
const sessionUserId = "clxxxxxxxxxxxxxxxxxxxxx5";

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

describe("participants API + approval reconciler guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue(authSession());
    mocks.requireFullSession.mockResolvedValue(null);
    mocks.getDefaultTenantForUser.mockResolvedValue({
      tenant: { id: tenantId },
    });
    mocks.canAccessRequest.mockResolvedValue(true);
    mocks.userFindUnique.mockResolvedValue({
      isPlatformBlocked: false,
      email: "creator@x.test",
    });
    mocks.recordFindFirst.mockResolvedValue({
      status: "OPEN",
      createdByUserId: sessionUserId,
    });
    mocks.recordFindUnique.mockResolvedValue({ title: "T", recordKey: "REQ-1" });
    mocks.tenantMembershipFindUnique.mockResolvedValue({ status: "ACTIVE" });
    mocks.recomputeApprovalStatus.mockResolvedValue({
      previousStatus: "NOT_STARTED",
      newStatus: "WAITING_FOR_APPROVAL",
      changed: true,
      isTerminalTransition: false,
    });
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  describe("POST /api/records/[id]/participants", () => {
    it("does not call recomputeApprovalStatus when assigning VIEWER", async () => {
      mocks.recordParticipantFindUnique.mockResolvedValue(null);

      const innerTx = {
        recordParticipant: {
          create: vi.fn().mockResolvedValue({
            id: participantId,
            participantType: "INTERNAL",
            participantRole: "VIEWER",
            status: "PENDING",
            createdAt: new Date(),
          }),
        },
        recordAccess: { upsert: vi.fn().mockResolvedValue({}) },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      const req = new Request("http://localhost/api/records/x/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, participantRole: "VIEWER" }),
      });

      const res = await POST_PARTICIPANTS(req, {
        params: Promise.resolve({ id: recordId }),
      });

      expect(res.status).toBe(201);
      expect(mocks.recomputeApprovalStatus).not.toHaveBeenCalled();
    });

    it("calls recomputeApprovalStatus when assigning APPROVER", async () => {
      mocks.recordParticipantFindUnique.mockResolvedValue(null);

      const innerTx = {
        recordParticipant: {
          create: vi.fn().mockResolvedValue({
            id: participantId,
            participantType: "INTERNAL",
            participantRole: "APPROVER",
            status: "PENDING",
            createdAt: new Date(),
          }),
        },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      mocks.userFindUnique
        .mockResolvedValueOnce({ isPlatformBlocked: false, email: "creator@x.test" })
        .mockResolvedValueOnce({ email: "target@x.test", name: "Target" });

      const req = new Request("http://localhost/api/records/x/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, participantRole: "APPROVER" }),
      });

      const res = await POST_PARTICIPANTS(req, {
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

  describe("POST /api/records/[id]/participants/[participantId]/action", () => {
    beforeEach(() => {
      mocks.recordParticipantFindFirst.mockResolvedValue({
        id: participantId,
        status: "PENDING",
      });
      mocks.recordFindFirst.mockResolvedValue({ status: "OPEN" });
    });

    it("does not call recomputeApprovalStatus for COMMENT", async () => {
      mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          recordComment: { create: vi.fn().mockResolvedValue({}) },
          recordEvent: { create: vi.fn().mockResolvedValue({}) },
        })
      );

      const req = new Request("http://localhost/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "COMMENT", comment: "note" }),
      });

      await POST_ACTION(req, {
        params: Promise.resolve({ id: recordId, participantId }),
      });

      expect(mocks.recomputeApprovalStatus).not.toHaveBeenCalled();
    });

    it("calls recomputeApprovalStatus after APPROVE", async () => {
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

      const req = new Request("http://localhost/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });

      const res = await POST_ACTION(req, {
        params: Promise.resolve({ id: recordId, participantId }),
      });

      expect(res.status).toBe(200);
      expect(mocks.recomputeApprovalStatus).toHaveBeenCalledTimes(1);
      expect(mocks.recomputeApprovalStatus).toHaveBeenCalledWith(
        innerTx,
        expect.objectContaining({
          triggeredByAction: "INTERNAL_APPROVED",
          actorUserId: sessionUserId,
        })
      );
    });
  });

  describe("DELETE /api/records/[id]/participants/[participantId]", () => {
    it("does not call recomputeApprovalStatus when revoking VIEWER", async () => {
      mocks.recordFindFirst.mockResolvedValue({
        status: "OPEN",
        createdByUserId: sessionUserId,
      });
      mocks.recordParticipantFindFirst.mockResolvedValue({
        id: participantId,
        status: "PENDING",
        revokedAt: null,
        participantRole: "VIEWER",
        participantType: "INTERNAL",
        userId: targetUserId,
        email: null,
        name: null,
      });

      mocks.userFindUnique
        .mockResolvedValueOnce({ isPlatformBlocked: false })
        .mockResolvedValueOnce({ name: "V", email: "v@test" });

      const innerTx = {
        recordParticipant: { update: vi.fn().mockResolvedValue({}) },
        recordAccess: { deleteMany: vi.fn().mockResolvedValue({}) },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      const res = await DELETE_PARTICIPANT(
        new Request("http://localhost/api/del"),
        { params: Promise.resolve({ id: recordId, participantId }) }
      );

      expect(res.status).toBe(200);
      expect(mocks.recomputeApprovalStatus).not.toHaveBeenCalled();
    });

    it("calls recomputeApprovalStatus when revoking APPROVER", async () => {
      mocks.recordFindFirst.mockResolvedValue({
        status: "OPEN",
        createdByUserId: sessionUserId,
      });
      mocks.recordParticipantFindFirst.mockResolvedValue({
        id: participantId,
        status: "PENDING",
        revokedAt: null,
        participantRole: "APPROVER",
        participantType: "INTERNAL",
        userId: targetUserId,
        email: null,
        name: null,
      });

      mocks.userFindUnique
        .mockResolvedValueOnce({ isPlatformBlocked: false })
        .mockResolvedValueOnce({ name: "A", email: "a@test" });

      const innerTx = {
        recordParticipant: { update: vi.fn().mockResolvedValue({}) },
        recordEvent: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      mocks.$transaction.mockImplementation(async (fn: (tx: typeof innerTx) => Promise<unknown>) =>
        fn(innerTx)
      );

      const res = await DELETE_PARTICIPANT(
        new Request("http://localhost/api/del"),
        { params: Promise.resolve({ id: recordId, participantId }) }
      );

      expect(res.status).toBe(200);
      expect(mocks.recomputeApprovalStatus).toHaveBeenCalledWith(
        innerTx,
        expect.objectContaining({
          triggeredByAction: "PARTICIPANT_REVOKED",
          triggeredByParticipantId: participantId,
        })
      );
    });
  });
});
