import { getServerSession } from "next-auth";
import { SupportMessageAuthorKind, SupportTicketPriority, SupportTicketStatus } from "@prisma/client";
import { z } from "zod";

import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId } from "@/server/billing/tenant-context";
import { JOB_TYPES, enqueueBackgroundJob } from "@/server/jobs/background-jobs";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { writeAuditLog } from "@/server/services/audit";
import { findLeastLoadedAdmin } from "@/server/support/support-auto-assign";
import { checkSupportTicketCreateLimit } from "@/server/support/support-rate-limits";

const createSchema = z.object({
  subject: z.string().min(1).max(255),
  message: z.string().min(1).max(4000),
  priority: z.nativeEnum(SupportTicketPriority),
  topicCategoryId: z.string().cuid().optional().nullable(),
});

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const canReadAll = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "support.ticket.read_workspace",
  });

  const rows = await prisma.supportTicket.findMany({
    where: {
      tenantId,
      ...(canReadAll ? {} : { requesterUserId: session.user.id }),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      status: true,
      priority: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });

  return apiSuccess({ tickets: rows });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) {
    return apiError("PLATFORM_BLOCKED", 403, "Your account cannot create support requests.");
  }

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const canCreate = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "support.ticket.create",
  });
  if (!canCreate) return ApiErrors.FORBIDDEN();

  const rl = await checkSupportTicketCreateLimit(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many tickets created", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const body = await parseBody(req, createSchema);

  if (body.topicCategoryId) {
    const cat = await prisma.knowledgeBaseCategory.findFirst({
      where: { id: body.topicCategoryId, isPublished: true },
      select: { id: true },
    });
    if (!cat) {
      return ApiErrors.VALIDATION_ERROR("Invalid topic category");
    }
  }

  const preview = body.message.slice(0, 500);

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        tenantId,
        createdByUserId: session.user.id,
        requesterUserId: session.user.id,
        subject: body.subject.trim(),
        descriptionPreview: preview,
        topicCategoryId: body.topicCategoryId ?? null,
        priority: body.priority,
        status: SupportTicketStatus.OPEN,
        lastMessageAt: new Date(),
      },
    });

    await tx.supportTicketMessage.create({
      data: {
        ticketId: t.id,
        authorUserId: session.user.id,
        authorKind: SupportMessageAuthorKind.WORKSPACE_USER,
        bodyText: body.message,
        isInternal: false,
      },
    });

    return t;
  });

  const assigneeId = await findLeastLoadedAdmin();
  if (assigneeId) {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { assigneePlatformUserId: assigneeId },
    });
    await enqueueBackgroundJob({
      jobType: JOB_TYPES.SUPPORT_TICKET_ASSIGNED_NOTIFY,
      idempotencyKey: `support:assigned_notify:${ticket.id}`,
      payload: { ticketId: ticket.id, assigneeId },
      tenantId,
    });
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "support.ticket.created",
    targetType: "SupportTicket",
    targetId: ticket.id,
    metadata: { ticketId: ticket.id },
  });

  await enqueueBackgroundJob({
    jobType: JOB_TYPES.SUPPORT_NEW_TICKET,
    idempotencyKey: `support:new_ticket:${ticket.id}`,
    payload: { ticketId: ticket.id, assigneeId: assigneeId ?? null },
    tenantId,
  });

  return apiSuccess({ ticketId: ticket.id }, 201);
});
