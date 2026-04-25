import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().cuid(),
  participantId: z.string().cuid(),
});

/**
 * POST /api/records/[id]/participants/[participantId]/viewed
 * Mark an internal participant as having viewed the request.
 * Sets lastUsedAt on first view only (idempotent).
 * Writes a PARTICIPANT_VIEWED timeline event on first view.
 */
export const POST = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string; participantId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid id");
  const { id: recordId, participantId } = parseResult.data;

  // Find the participant — must belong to this user, record, and tenant
  const participant = await prisma.recordParticipant.findFirst({
    where: {
      id: participantId,
      recordId,
      tenantId,
      participantType: "INTERNAL",
      userId: session.user.id,
      revokedAt: null,
    },
    select: { id: true, lastUsedAt: true, participantRole: true },
  });

  if (!participant) return ApiErrors.NOT_FOUND("Participant");

  // Idempotent — only update and log on first view
  if (participant.lastUsedAt) {
    return apiSuccess({ alreadyViewed: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.recordParticipant.update({
      where: { id: participant.id },
      data: { lastUsedAt: new Date() },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "PARTICIPANT_VIEWED",
        actorUserId: session.user.id,
        metadata: {
          participantId: participant.id,
          participantRole: participant.participantRole,
        },
      },
    });
  });

  return apiSuccess({ viewed: true });
});
