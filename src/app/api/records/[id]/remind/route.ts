import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const REMINDER_WINDOW_MS = 10 * 60 * 1000;
const REMINDER_MAX = 1;

/**
 * POST /api/records/[id]/remind
 * E4 — Send manual reminder to all PENDING approvers.
 * Soft rate limit: 1 per 10 min per record.
 * Blocked if record is CLOSED or no pending approvers.
 */
export const POST = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const canRemind = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.approvals.remind",
  });
  if (!canRemind) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot send reminders for a closed record.");
  }

  const rl = await checkRateLimit(
    `remind:${recordId}`,
    REMINDER_MAX,
    REMINDER_WINDOW_MS
  );
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED(
      "Reminder recently sent. Please wait before sending another.",
      { retryAfterSeconds: rl.retryAfterSeconds }
    );
  }

  const pendingParticipants = await prisma.recordParticipant.findMany({
    where: {
      recordId,
      tenantId,
      participantRole: "APPROVER",
      status: "PENDING",
      revokedAt: null,
    },
    select: {
      id: true,
      participantType: true,
      userId: true,
      email: true,
      expiresAt: true,
    },
  });

  if (pendingParticipants.length === 0) {
    return ApiErrors.CONFLICT("No pending approvers to remind.");
  }

  const validParticipants = pendingParticipants.filter(
    (p) => p.participantType === "INTERNAL" || !p.expiresAt || p.expiresAt > new Date()
  );

  if (validParticipants.length === 0) {
    return ApiErrors.CONFLICT("No pending approvers to remind (all external links expired).");
  }

  const recipientsCount = validParticipants.length;

  await prisma.$transaction(async (tx) => {
    await tx.recordReminderLog.create({
      data: {
        tenantId,
        recordId,
        sentByUserId: session.user.id,
        recipientsCount,
        metadata: {
          participantIds: validParticipants.map((p) => p.id),
        },
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "REMINDER_SENT",
        actorUserId: session.user.id,
        metadata: {
          recipientsCount,
          recipientTypes: [...new Set(validParticipants.map((p) => p.participantType))],
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.reminder.sent",
        targetType: "Record",
        targetId: recordId,
        metadata: {
          recipientsCount,
          sentByUserId: session.user.id,
        },
      },
    });
  });

  return apiSuccess({
    recipientsCount,
    skippedExpired: pendingParticipants.length - recipientsCount,
  });
});
