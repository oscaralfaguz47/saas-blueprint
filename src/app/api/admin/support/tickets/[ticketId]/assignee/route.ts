import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ ticketId: z.string().cuid() });
const bodySchema = z.object({
  assigneeUserId: z.string().cuid().nullable(),
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
    select: { id: true, tenantId: true, assigneePlatformUserId: true },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();

  if (body.assigneeUserId) {
    const u = await prisma.user.findUnique({
      where: { id: body.assigneeUserId },
      select: { id: true, isPlatformBlocked: true },
    });
    if (!u || u.isPlatformBlocked) return ApiErrors.VALIDATION_ERROR("Invalid assignee");
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { assigneePlatformUserId: body.assigneeUserId },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    tenantId: ticket.tenantId,
    action: body.assigneeUserId ? "support.ticket.assigned" : "support.ticket.unassigned",
    targetType: "SupportTicket",
    targetId: ticketId,
    metadata: {
      ticketId,
      assigneeUserId: body.assigneeUserId,
      previousAssigneeUserId: ticket.assigneePlatformUserId,
    },
  });

  return apiSuccess({ ok: true });
});
