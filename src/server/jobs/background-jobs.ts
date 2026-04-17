import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

export const JOB_TYPES = {
  KB_ARTICLE_INDEX: "kb.article.index",
  SUPPORT_NEW_TICKET: "support.notification.new_ticket",
  SUPPORT_NEW_REPLY: "support.notification.new_reply",
  SUPPORT_TICKET_CLOSED: "support.notification.ticket_closed",
  SUPPORT_TICKET_REPLY_NOTIFY: "support.notification.reply_notify",
  SUPPORT_TICKET_STATUS_NOTIFY: "support.notification.status_notify",
  NOTIFICATION_CLEANUP: "notification.cleanup",
  SUPPORT_USER_REPLY_NOTIFY: "support.notification.user_reply_notify",
  SUPPORT_TICKET_ASSIGNED_NOTIFY: "support.notification.ticket_assigned_notify",
  EXPORT_PDF: "record.export.pdf",
  EXPORT_ZIP_BUNDLE: "record.export.zip_bundle",
} as const;

/**
 * Enqueue a background job. Duplicate `idempotencyKey` is ignored (idempotent no-op).
 */
export async function enqueueBackgroundJob(params: {
  jobType: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  tenantId?: string | null;
  scheduledFor?: Date;
}): Promise<void> {
  try {
    await prisma.backgroundJob.create({
      data: {
        jobType: params.jobType,
        idempotencyKey: params.idempotencyKey,
        payload: params.payload,
        tenantId: params.tenantId ?? null,
        scheduledFor: params.scheduledFor ?? new Date(),
      },
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return;
    }
    throw e;
  }
}

/**
 * Enqueue a job and return its id. On idempotency-key collision, returns the existing job id.
 */
export async function enqueueBackgroundJobReturning(params: {
  jobType: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  tenantId?: string | null;
  scheduledFor?: Date;
}): Promise<{ id: string }> {
  try {
    return await prisma.backgroundJob.create({
      data: {
        jobType: params.jobType,
        idempotencyKey: params.idempotencyKey,
        payload: params.payload,
        tenantId: params.tenantId ?? null,
        scheduledFor: params.scheduledFor ?? new Date(),
      },
      select: { id: true },
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      const existing = await prisma.backgroundJob.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
        select: { id: true },
      });
      if (existing) return existing;
    }
    throw e;
  }
}
