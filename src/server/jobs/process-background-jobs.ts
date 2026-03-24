import "server-only";

import { prisma } from "@/server/db";
import { sendEmail } from "@/server/services/invitation-email";
import { indexKbArticle } from "@/server/knowledge-base/kb-indexer";
import { JOB_TYPES } from "@/server/jobs/background-jobs";
import { env } from "@/lib/env";

const MAX_BATCH = 15;

function appUrl(): string {
  return env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || env.NEXTAUTH_URL?.replace(/\/+$/, "") || "";
}

async function sendTicketEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    await sendEmail(params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[jobs] Email send failed", msg);
    throw e;
  }
}

export async function processPendingBackgroundJobs(): Promise<{
  processed: number;
  failed: number;
}> {
  let processed = 0;
  let failed = 0;

  const now = new Date();
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    orderBy: [{ scheduledFor: "asc" }],
    take: MAX_BATCH,
  });

  for (const job of jobs) {
    const lock = await prisma.backgroundJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (lock.count === 0) continue;

    try {
      await executeJob(job);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DONE", processedAt: new Date(), lastError: null },
      });
      processed++;
      // eslint-disable-next-line no-console
      console.warn("[jobs] ok", { jobType: job.jobType, id: job.id, tenantId: job.tenantId });
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message.slice(0, 500) : "error";
      const attemptsAfterStart = job.attempts + 1;
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: attemptsAfterStart >= 3 ? "FAILED" : "PENDING",
          lastError: msg,
          scheduledFor: new Date(
            Date.now() + Math.min(60_000 * attemptsAfterStart, 15 * 60_000)
          ),
        },
      });
      // eslint-disable-next-line no-console
      console.warn("[jobs] failed", {
        jobType: job.jobType,
        id: job.id,
        tenantId: job.tenantId,
        err: msg,
      });
    }
  }

  return { processed, failed };
}

async function executeJob(job: {
  id: string;
  jobType: string;
  payload: unknown;
  tenantId: string | null;
}): Promise<void> {
  const payload = job.payload as Record<string, unknown>;

  if (job.jobType === JOB_TYPES.KB_ARTICLE_INDEX) {
    const articleId = typeof payload.articleId === "string" ? payload.articleId : null;
    if (!articleId) throw new Error("invalid_payload");
    await indexKbArticle(articleId);
    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_NEW_TICKET) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    if (!ticketId) throw new Error("invalid_payload");
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        requesterEmail: true,
        tenant: { select: { name: true } },
        requester: { select: { email: true, name: true } },
      },
    });
    const toEmail = ticket?.requester?.email ?? ticket?.requesterEmail;
    if (!ticket || !toEmail) return;
    const base = appUrl();
    const link = base ? `${base}/app/help/tickets/${ticket.id}` : `/app/help/tickets/${ticket.id}`;
    const workspaceLabel = ticket.tenant?.name ?? "Relitrue";
    await sendTicketEmail({
      to: toEmail,
      subject: `Support request received: ${ticket.subject}`,
      html: `<p>Hi ${ticket.requester?.name ?? ""},</p><p>We received your support request for workspace <strong>${workspaceLabel}</strong>.</p><p><a href="${link}">View your ticket</a></p>`,
    });
    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_NEW_REPLY) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    if (!ticketId || !messageId) throw new Error("invalid_payload");
    const msg = await prisma.supportTicketMessage.findUnique({
      where: { id: messageId },
      select: { id: true, authorKind: true },
    });
    if (!msg || msg.authorKind !== "PLATFORM_ADMIN") return;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        requesterEmail: true,
        requester: { select: { email: true, name: true } },
      },
    });
    const toEmail = ticket?.requester?.email ?? ticket?.requesterEmail;
    if (!ticket || !toEmail) return;
    const base = appUrl();
    const link = base ? `${base}/app/help/tickets/${ticket.id}` : `/app/help/tickets/${ticket.id}`;
    await sendTicketEmail({
      to: toEmail,
      subject: `New reply on: ${ticket.subject}`,
      html: `<p>Hi ${ticket.requester?.name ?? ""},</p><p>Relitrue Support replied to your ticket.</p><p><a href="${link}">Open thread</a></p>`,
    });
    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_TICKET_CLOSED) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    if (!ticketId) throw new Error("invalid_payload");
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        status: true,
        requesterEmail: true,
        requester: { select: { email: true, name: true } },
      },
    });
    if (!ticket || ticket.status !== "CLOSED") return;
    const toEmail = ticket.requester?.email ?? ticket.requesterEmail;
    if (!toEmail) return;
    const base = appUrl();
    const link = base ? `${base}/app/help/tickets/${ticket.id}` : `/app/help/tickets/${ticket.id}`;
    await sendTicketEmail({
      to: toEmail,
      subject: `Ticket closed: ${ticket.subject}`,
      html: `<p>Hi ${ticket.requester?.name ?? ""},</p><p>Your support ticket was closed.</p><p><a href="${link}">View ticket</a></p>`,
    });
    return;
  }

  throw new Error(`unknown_job_type:${job.jobType}`);
}
