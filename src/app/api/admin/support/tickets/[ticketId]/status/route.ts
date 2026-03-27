import { getServerSession } from "next-auth";
import { SupportTicketStatus, SupportTicketType } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { authOptions } from "@/server/auth-options";
import { JOB_TYPES, enqueueBackgroundJob } from "@/server/jobs/background-jobs";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";
import { isValidTicketTransition } from "@/server/support/support-transitions";

const paramsSchema = z.object({ ticketId: z.string().cuid() });
const bodySchema = z.object({
  status: z.nativeEnum(SupportTicketStatus),
});

export const PATCH = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ ticketId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { ticketId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, bodySchema);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, tenantId: true, ticketType: true },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();

  if (body.status === SupportTicketStatus.OPEN && ticket.status === SupportTicketStatus.CLOSED) {
    return ApiErrors.CONFLICT("Use the reopen endpoint to open a closed ticket.");
  }

  if (!isValidTicketTransition(ticket.status, body.status)) {
    return ApiErrors.CONFLICT("Invalid status transition", {
      code: "SUPPORT_TICKET_INVALID_TRANSITION",
    });
  }

  const closedAt =
    body.status === SupportTicketStatus.CLOSED ? new Date() : null;

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: body.status,
      closedAt,
      reopenedAt: null,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    tenantId: ticket.tenantId,
    action: "support.ticket.status_changed",
    targetType: "SupportTicket",
    targetId: ticketId,
    metadata: {
      ticketId,
      previousStatus: ticket.status,
      newStatus: body.status,
    },
  });

  if (ticket.ticketType !== SupportTicketType.SALES_INQUIRY) {
    await enqueueBackgroundJob({
      jobType: JOB_TYPES.SUPPORT_TICKET_STATUS_NOTIFY,
      idempotencyKey: `support:status_notify:${ticketId}:${body.status}`,
      payload: {
        ticketId,
        previousStatus: ticket.status,
        newStatus: body.status,
      },
      tenantId: ticket.tenantId,
    });
  }

  if (
    body.status === SupportTicketStatus.CLOSED &&
    ticket.ticketType !== SupportTicketType.SALES_INQUIRY
  ) {
    await enqueueBackgroundJob({
      jobType: JOB_TYPES.SUPPORT_TICKET_CLOSED,
      idempotencyKey: `support:closed:${ticketId}:${closedAt!.toISOString()}`,
      payload: { ticketId },
      tenantId: ticket.tenantId,
    });
  }

  return apiSuccess({ ok: true });
});
