import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspaceDetailLimit } from "@/server/security/admin-rate-limit";

const paramsSchema = z.object({ ticketId: z.string().cuid() });

export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ ticketId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspaceDetailLimit(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const { ticketId } = paramsSchema.parse(await context.params);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      topicCategory: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!ticket) return ApiErrors.NOT_FOUND();

  const messages = await prisma.supportTicketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  return apiSuccess({ ticket, messages });
});
