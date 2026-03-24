import { getServerSession } from "next-auth";
import { SupportMessageAuthorKind, SupportTicketStatus } from "@prisma/client";
import { z } from "zod";

import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId } from "@/server/billing/tenant-context";
import { JOB_TYPES, enqueueBackgroundJob } from "@/server/jobs/background-jobs";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { canAccessSupportTicket } from "@/server/support/support-access";
import { canUserReplyToSupportTicket } from "@/server/support/support-reply-permission";
import { checkSupportTicketReplyLimit } from "@/server/support/support-rate-limits";

const paramsSchema = z.object({ ticketId: z.string().cuid() });

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
});

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ ticketId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) {
    return apiError("PLATFORM_BLOCKED", 403, "Your account cannot reply.");
  }

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const { ticketId } = paramsSchema.parse(await context.params);

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      id: true,
      status: true,
      requesterUserId: true,
      tenantId: true,
    },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();
  if (!ticket.requesterUserId) {
    return ApiErrors.NOT_FOUND();
  }

  const allowed = await canAccessSupportTicket({
    tenantId,
    userId: session.user.id,
    ticketId,
    legacyRole: session.user.role,
    isVendorAdmin: false,
  });
  if (!allowed) return ApiErrors.NOT_FOUND();

  const canReply = await canUserReplyToSupportTicket({
    userId: session.user.id,
    tenantId,
    requesterUserId: ticket.requesterUserId,
  });
  if (!canReply) return ApiErrors.FORBIDDEN();

  if (ticket.status === SupportTicketStatus.CLOSED) {
    return apiError("SUPPORT_TICKET_CLOSED", 409, "Ticket is closed.");
  }

  const rl = await checkSupportTicketReplyLimit(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many replies", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const body = await parseBody(req, bodySchema);

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.supportTicketMessage.create({
      data: {
        ticketId,
        authorUserId: session.user.id,
        authorKind: SupportMessageAuthorKind.WORKSPACE_USER,
        bodyText: body.message,
        isInternal: false,
      },
    });

    const nextStatus =
      ticket.status === SupportTicketStatus.WAITING_FOR_CUSTOMER
        ? SupportTicketStatus.IN_PROGRESS
        : ticket.status;

    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: new Date(),
        status: nextStatus,
      },
    });

    return m;
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "support.ticket.replied",
    targetType: "SupportTicket",
    targetId: ticketId,
    metadata: { ticketId, messageId: msg.id },
  });

  await enqueueBackgroundJob({
    jobType: JOB_TYPES.SUPPORT_NEW_REPLY,
    idempotencyKey: `support:new_reply:${msg.id}`,
    payload: { ticketId, messageId: msg.id },
    tenantId,
  });

  return apiSuccess({ messageId: msg.id });
});
