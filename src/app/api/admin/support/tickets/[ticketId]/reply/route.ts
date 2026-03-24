import { getServerSession } from "next-auth";
import { SupportMessageAuthorKind, SupportTicketStatus } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { authOptions } from "@/server/auth-options";
import { JOB_TYPES, enqueueBackgroundJob } from "@/server/jobs/background-jobs";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ ticketId: z.string().cuid() });
const bodySchema = z.object({
  message: z.string().min(1).max(8000),
});

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ ticketId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.reply");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { ticketId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, bodySchema);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();
  if (ticket.status === SupportTicketStatus.CLOSED) {
    return ApiErrors.CONFLICT("Ticket is closed");
  }

  const nextStatus =
    ticket.status === SupportTicketStatus.OPEN ||
    ticket.status === SupportTicketStatus.IN_PROGRESS
      ? SupportTicketStatus.WAITING_FOR_CUSTOMER
      : ticket.status;

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.supportTicketMessage.create({
      data: {
        ticketId,
        authorUserId: session.user.id,
        authorKind: SupportMessageAuthorKind.PLATFORM_ADMIN,
        bodyText: body.message,
        isInternal: false,
      },
    });
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
    actorContext: "VENDOR",
    tenantId: ticket.tenantId,
    action: "support.ticket.replied",
    targetType: "SupportTicket",
    targetId: ticketId,
    metadata: { ticketId, messageId: msg.id },
  });

  await enqueueBackgroundJob({
    jobType: JOB_TYPES.SUPPORT_NEW_REPLY,
    idempotencyKey: `support:new_reply:${msg.id}`,
    payload: { ticketId, messageId: msg.id },
    tenantId: ticket.tenantId,
  });

  return apiSuccess({ messageId: msg.id });
});
