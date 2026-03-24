import { getServerSession } from "next-auth";
import { SupportMessageAuthorKind, SupportTicketStatus } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";
import { isValidReopenTransition } from "@/server/support/support-transitions";

const paramsSchema = z.object({ ticketId: z.string().cuid() });

export const POST = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ ticketId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { ticketId } = paramsSchema.parse(await context.params);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();

  if (!isValidReopenTransition(ticket.status, SupportTicketStatus.OPEN)) {
    return ApiErrors.CONFLICT("Ticket is not closed");
  }

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: SupportTicketStatus.OPEN,
        closedAt: null,
        reopenedAt: new Date(),
      },
    });
    await tx.supportTicketMessage.create({
      data: {
        ticketId,
        authorUserId: null,
        authorKind: SupportMessageAuthorKind.SYSTEM,
        bodyText: "Ticket reopened.",
        isInternal: false,
      },
    });
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    tenantId: ticket.tenantId,
    action: "support.ticket.reopened",
    targetType: "SupportTicket",
    targetId: ticketId,
    metadata: { ticketId },
  });

  return apiSuccess({ ok: true });
});
