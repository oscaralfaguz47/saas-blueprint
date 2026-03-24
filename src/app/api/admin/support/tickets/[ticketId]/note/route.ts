import { getServerSession } from "next-auth";
import { SupportMessageAuthorKind } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { authOptions } from "@/server/auth-options";
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
  const authError = await requireAdminAuth(session, "admin.support.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { ticketId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, bodySchema);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, tenantId: true },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();

  const msg = await prisma.supportTicketMessage.create({
    data: {
      ticketId,
      authorUserId: session.user.id,
      authorKind: SupportMessageAuthorKind.PLATFORM_ADMIN,
      bodyText: body.message,
      isInternal: true,
    },
  });

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { lastMessageAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    tenantId: ticket.tenantId,
    action: "support.ticket.internal_note_added",
    targetType: "SupportTicket",
    targetId: ticketId,
    metadata: { ticketId, messageId: msg.id },
  });

  return apiSuccess({ messageId: msg.id });
});
