import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().cuid(),
  participantId: z.string().cuid(),
});

/**
 * DELETE /api/records/[id]/participants/[participantId]
 * Remove (revoke) a participant from a request.
 *
 * Authorization rules:
 * - Only the request creator may remove participants.
 * - Cannot remove a participant who has already responded (APPROVED or REJECTED).
 * - Cannot remove from a CLOSED record.
 * - Soft delete: sets revokedAt timestamp, does not hard delete.
 */
export const DELETE = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string; participantId: string }> }
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
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { id: recordId, participantId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  // Fetch record and participant in parallel
  const [record, participant] = await Promise.all([
    prisma.record.findFirst({
      where: { id: recordId, tenantId },
      select: { status: true, createdByUserId: true },
    }),
    prisma.recordParticipant.findFirst({
      where: { id: participantId, recordId, tenantId },
      select: {
        id: true,
        status: true,
        revokedAt: true,
        participantRole: true,
        participantType: true,
        userId: true,
        email: true,
        name: true,
      },
    }),
  ]);

  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (!participant) return ApiErrors.NOT_FOUND("Participant");

  // Only the request creator can remove participants
  if (record.createdByUserId !== session.user.id) return ApiErrors.FORBIDDEN();

  // Cannot remove from a closed record
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot remove participants from a closed record.");
  }

  // Cannot remove a participant who has already responded
  if (participant.status === "APPROVED" || participant.status === "REJECTED") {
    return ApiErrors.CONFLICT(
      "Cannot remove a participant who has already responded to this request."
    );
  }

  // Already revoked — idempotent
  if (participant.revokedAt) {
    return apiSuccess({ participantId, alreadyRevoked: true });
  }

  // Get display name for internal participants
  let removedDisplayName: string | null = participant.name ?? participant.email ?? null;
  if (participant.participantType === "INTERNAL" && participant.userId) {
    const removedUser = await prisma.user.findUnique({
      where: { id: participant.userId },
      select: { name: true, email: true },
    });
    removedDisplayName = removedUser?.name ?? removedUser?.email ?? removedDisplayName;
  }

  await prisma.$transaction(async (tx) => {
    await tx.recordParticipant.update({
      where: { id: participantId },
      data: { revokedAt: new Date() },
    });

    // Remove RecordAccess for VIEWER participants when revoked
    // Delete ALL access reasons — if viewer is explicitly removed, they lose access
    // regardless of how they were originally granted (manual share or mention auto-share)
    if (participant.participantRole === "VIEWER" && participant.userId) {
      await tx.recordAccess.deleteMany({
        where: {
          recordId,
          userId: participant.userId,
        },
      });
    }

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "APPROVAL_REQUESTED",
        actorUserId: session.user.id,
        metadata: {
          action: "participant_removed",
          participantId,
          participantRole: participant.participantRole,
          participantType: participant.participantType,
          removedUserId: participant.userId ?? null,
          removedEmail: participant.email ?? null,
          removedName: removedDisplayName,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.participant.removed",
        targetType: "RecordParticipant",
        targetId: participantId,
        metadata: {
          recordId,
          participantRole: participant.participantRole,
          participantType: participant.participantType,
          removedUserId: participant.userId ?? null,
        },
      },
    });
  });

  return apiSuccess({ participantId, removed: true });
});
