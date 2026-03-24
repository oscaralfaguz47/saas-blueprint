import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId } from "@/server/billing/tenant-context";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { canAccessSupportTicket } from "@/server/support/support-access";

const paramsSchema = z.object({ ticketId: z.string().cuid() });

export const GET = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ ticketId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const { ticketId } = paramsSchema.parse(await context.params);

  const allowed = await canAccessSupportTicket({
    tenantId,
    userId: session.user.id,
    ticketId,
    legacyRole: session.user.role,
    isVendorAdmin: false,
  });
  if (!allowed) return ApiErrors.NOT_FOUND();

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      id: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      lastMessageAt: true,
      closedAt: true,
      requesterUserId: true,
    },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();

  const messages = await prisma.supportTicketMessage.findMany({
    where: { ticketId, isInternal: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      bodyText: true,
      authorKind: true,
      createdAt: true,
      authorUserId: true,
    },
  });

  return apiSuccess({
    ticket,
    messages,
    isRequester: ticket.requesterUserId === session.user.id,
  });
});
