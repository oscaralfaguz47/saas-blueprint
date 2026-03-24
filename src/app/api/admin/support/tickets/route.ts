import { getServerSession } from "next-auth";
import { SupportTicketStatus } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspacesListLimit } from "@/server/security/admin-rate-limit";

const querySchema = z.object({
  tenantId: z.string().cuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(30),
  status: z.nativeEnum(SupportTicketStatus).optional(),
});

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.support.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspacesListLimit(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    tenantId: url.searchParams.get("tenantId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid query parameters");
  }

  const { tenantId, q, page, limit, status } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {
    ...(tenantId ? { tenantId } : {}),
    ...(status ? { status } : {}),
    ...(q?.trim()
      ? {
          OR: [
            { subject: { contains: q.trim(), mode: "insensitive" as const } },
            { requesterEmail: { contains: q.trim(), mode: "insensitive" as const } },
            { requester: { email: { contains: q.trim(), mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        ticketType: true,
        requesterEmail: true,
        lastMessageAt: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, slug: true } },
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return apiSuccess({ items, total, page, limit });
});
