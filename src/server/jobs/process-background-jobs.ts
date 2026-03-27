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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds a consistent Enterprise-grade HTML email for support ticket events.
 * Uses hardcoded hex values only — email clients do not support CSS variables.
 */
function buildSupportEmail(params: {
  recipientName: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}): string {
  const { recipientName, preheader, bodyHtml, ctaLabel, ctaUrl, footerNote } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${preheader}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <!-- Preheader text (shown in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">

          <!-- Logo / brand header -->
          <tr>
            <td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:24px 32px;background:#09090b;border-radius:12px 12px 0 0;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Relitrue</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 12px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">

              <!-- Greeting -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:28px 32px 0;">
                    <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
                  </td>
                </tr>

                <!-- Dynamic body content -->
                <tr>
                  <td style="padding:12px 32px 0;">
                    ${bodyHtml}
                  </td>
                </tr>

                <!-- CTA button -->
                <tr>
                  <td style="padding:24px 32px 28px;">
                    <a href="${ctaUrl}"
                       style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.1px;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:16px 32px 20px;background:#fafafa;border-top:1px solid #e4e4e7;">
                    <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                      ${
                        footerNote
                          ? escapeHtml(footerNote)
                          : "You're receiving this email because of activity on your Relitrue account."
                      }
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Bottom spacer -->
          <tr>
            <td style="padding:20px 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;">© Relitrue. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatTicketStatus(raw: string): string {
  switch (raw) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "WAITING_FOR_CUSTOMER":
      return "Waiting for customer";
    case "CLOSED":
      return "Closed";
    default:
      return raw.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
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
      html: buildSupportEmail({
        recipientName: ticket.requester?.name ?? "there",
        preheader: `Support request received: ${ticket.subject}`,
        bodyHtml: `
    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
      We received your support request. Our team typically responds within one business day.
    </p>
    <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${escapeHtml(ticket.subject)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#3f3f46;">Workspace: <strong>${escapeHtml(workspaceLabel)}</strong></p>
    </div>`,
        ctaLabel: "View your ticket",
        ctaUrl: link,
        footerNote: "You're receiving this because you submitted a support request.",
      }),
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
      html: buildSupportEmail({
        recipientName: ticket.requester?.name ?? "there",
        preheader: `New reply on your support ticket: ${ticket.subject}`,
        bodyHtml: `
    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
      Relitrue Support replied to your ticket. Open the thread to read the reply and respond.
    </p>
    <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${escapeHtml(ticket.subject)}</p>
    </div>`,
        ctaLabel: "View conversation",
        ctaUrl: link,
        footerNote: "You're receiving this because you have an open support ticket.",
      }),
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
        ticketType: true,
        requesterEmail: true,
        requester: { select: { email: true, name: true } },
      },
    });
    if (!ticket || ticket.status !== "CLOSED") return;
    if (ticket.ticketType === "SALES_INQUIRY") return;
    const toEmail = ticket.requester?.email ?? ticket.requesterEmail;
    if (!toEmail) return;
    const base = appUrl();
    const link = base ? `${base}/app/help/tickets/${ticket.id}` : `/app/help/tickets/${ticket.id}`;
    await sendTicketEmail({
      to: toEmail,
      subject: `Ticket closed: ${ticket.subject}`,
      html: buildSupportEmail({
        recipientName: ticket.requester?.name ?? "there",
        preheader: `Your support ticket has been closed: ${ticket.subject}`,
        bodyHtml: `
    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
      Your support ticket has been marked as closed. If you need further assistance,
      you can reopen it at any time.
    </p>
    <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${escapeHtml(ticket.subject)}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#71717a;">Status: <strong style="color:#09090b;">Closed</strong></p>
    </div>`,
        ctaLabel: "View ticket",
        ctaUrl: link,
        footerNote: "You're receiving this because you have a support ticket with us.",
      }),
    });
    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_TICKET_REPLY_NOTIFY) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    if (!ticketId || !messageId) throw new Error("invalid_payload");

    const msg = await prisma.supportTicketMessage.findUnique({
      where: { id: messageId },
      select: { id: true, authorKind: true, bodyText: true },
    });
    if (!msg || msg.authorKind !== "PLATFORM_ADMIN") return;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        tenantId: true,
        subject: true,
        ticketType: true,
        requesterUserId: true,
        requesterEmail: true,
        requester: { select: { id: true, email: true, name: true } },
      },
    });
    if (!ticket) return;
    if (ticket.ticketType === "SALES_INQUIRY") return;

    if (ticket.requesterUserId) {
      await prisma.userNotification.create({
        data: {
          userId: ticket.requesterUserId,
          notificationType: "support.ticket.reply",
          title: "New reply on your ticket",
          body: ticket.subject,
          entityType: "SupportTicket",
          entityId: ticketId,
          actionUrl: `/app/help/tickets/${ticketId}`,
        },
      });
    }

    const toEmail = ticket.requester?.email ?? ticket.requesterEmail;
    if (!toEmail) return;
    const base = appUrl();
    const ticketUrl = base ? `${base}/app/help/tickets/${ticket.id}` : `/app/help/tickets/${ticket.id}`;
    const safeSubject = escapeHtml(ticket.subject);
    const replyPreview = msg.bodyText ?? "";
    const replyPreviewTruncated = replyPreview.slice(0, 500);
    const replyPreviewSuffix = replyPreview.length > 500 ? "…" : "";
    try {
      await sendTicketEmail({
        to: toEmail,
        subject: `New reply on your support ticket: ${ticket.subject}`,
        html: buildSupportEmail({
          recipientName: ticket.requester?.name ?? "there",
          preheader: `New reply on your support ticket: ${ticket.subject}`,
          bodyHtml: `
    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
      Relitrue Support replied to your ticket.
    </p>
    <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${safeSubject}</p>
    </div>
    <div style="margin:16px 0 0;border-left:3px solid #e4e4e7;padding:10px 16px;background:#fafafa;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Reply</p>
      <p style="margin:6px 0 0;font-size:14px;color:#3f3f46;line-height:1.6;white-space:pre-wrap;">${escapeHtml(replyPreviewTruncated)}${replyPreviewSuffix}</p>
    </div>`,
          ctaLabel: "View conversation",
          ctaUrl: ticketUrl,
          footerNote: "You're receiving this because you have an open support ticket.",
        }),
      });
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : "unknown";
      console.error("[jobs] support reply email failed", msgErr);
    }
    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_TICKET_STATUS_NOTIFY) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    const previousStatus = typeof payload.previousStatus === "string" ? payload.previousStatus : null;
    const newStatus = typeof payload.newStatus === "string" ? payload.newStatus : null;
    if (!ticketId || !previousStatus || !newStatus) throw new Error("invalid_payload");
    if (newStatus === previousStatus) return;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        tenantId: true,
        subject: true,
        ticketType: true,
        requesterUserId: true,
        requesterEmail: true,
        requester: { select: { id: true, email: true, name: true } },
      },
    });
    if (!ticket) return;
    if (ticket.ticketType === "SALES_INQUIRY") return;

    if (ticket.requesterUserId) {
      await prisma.userNotification.create({
        data: {
          userId: ticket.requesterUserId,
          notificationType: "support.ticket.status_changed",
          title: "Your ticket status was updated",
          body: `${ticket.subject} · ${previousStatus} → ${newStatus}`,
          entityType: "SupportTicket",
          entityId: ticketId,
          actionUrl: `/app/help/tickets/${ticketId}`,
        },
      });
    }

    const toEmail = ticket.requester?.email ?? ticket.requesterEmail;
    if (!toEmail) return;
    const base = appUrl();
    const ticketUrl = base ? `${base}/app/help/tickets/${ticket.id}` : `/app/help/tickets/${ticket.id}`;
    const safeSubject = escapeHtml(ticket.subject);
    try {
      await sendTicketEmail({
        to: toEmail,
        subject: `Ticket status updated: ${ticket.subject}`,
        html: buildSupportEmail({
          recipientName: ticket.requester?.name ?? "there",
          preheader: `Your ticket status was updated: ${ticket.subject}`,
          bodyHtml: `
    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
      The status of your support ticket was updated.
    </p>
    <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${safeSubject}</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:10px 0 0;">
        <tr>
          <td style="font-size:13px;color:#71717a;padding-right:8px;">From</td>
          <td style="font-size:13px;font-weight:600;color:#09090b;">${escapeHtml(formatTicketStatus(previousStatus))}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#71717a;padding-right:8px;padding-top:4px;">To</td>
          <td style="font-size:13px;font-weight:600;color:#09090b;padding-top:4px;">${escapeHtml(formatTicketStatus(newStatus))}</td>
        </tr>
      </table>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#71717a;">
      If you didn't expect this change, you can reply to your ticket directly.
    </p>`,
          ctaLabel: "View ticket",
          ctaUrl: ticketUrl,
          footerNote: "You're receiving this because you have a support ticket with us.",
        }),
      });
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : "unknown";
      console.error("[jobs] support status email failed", msgErr);
    }
    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_USER_REPLY_NOTIFY) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    if (!ticketId || !messageId) throw new Error("invalid_payload");

    // Confirm the message exists and was authored by a WORKSPACE_USER.
    const msg = await prisma.supportTicketMessage.findUnique({
      where: { id: messageId },
      select: { id: true, authorKind: true, bodyText: true },
    });
    if (!msg || msg.authorKind !== "WORKSPACE_USER") return;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        assigneePlatformUserId: true,
        assignee: { select: { id: true, email: true, name: true } },
      },
    });

    // No assignee — nothing to notify.
    if (!ticket?.assigneePlatformUserId || !ticket.assignee) return;

    // Idempotency guard: use messageId so each reply produces its own notification
    const existing = await prisma.userNotification.findFirst({
      where: {
        userId: ticket.assigneePlatformUserId,
        notificationType: "support.ticket.user_replied",
        entityType: "SupportTicketMessage",
        entityId: messageId,
      },
      select: { id: true },
    });
    if (existing) return;

    // 1) In-app notification for the assigned platform admin.
    await prisma.userNotification.create({
      data: {
        userId: ticket.assigneePlatformUserId,
        notificationType: "support.ticket.user_replied",
        title: "Customer replied to a ticket",
        body: ticket.subject,
        entityType: "SupportTicketMessage",
        entityId: messageId,
        actionUrl: `/admin/support?ticketId=${ticketId}`,
      },
    });

    // 2) Email notification — best effort.
    try {
      const base = appUrl();
      const adminTicketUrl = base
        ? `${base}/admin/support?ticketId=${ticket.id}`
        : `/admin/support?ticketId=${ticket.id}`;

      const assigneeName = ticket.assignee.name ?? "Support";
      const assigneeEmail = ticket.assignee.email;
      if (!assigneeEmail) return;

      const customerReplyPreview = msg.bodyText ?? "";
      const customerReplyTruncated = customerReplyPreview.slice(0, 500);
      const customerReplySuffix = customerReplyPreview.length > 500 ? "…" : "";

      await sendTicketEmail({
        to: assigneeEmail,
        subject: `Customer replied: ${escapeHtml(ticket.subject)}`,
        html: buildSupportEmail({
          recipientName: assigneeName,
          preheader: `Customer replied to: ${ticket.subject}`,
          bodyHtml: `
    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
      A customer replied to a support ticket assigned to you.
    </p>
    <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${escapeHtml(ticket.subject)}</p>
    </div>
    <div style="margin:16px 0 0;border-left:3px solid #e4e4e7;padding:10px 16px;background:#fafafa;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Customer replied</p>
      <p style="margin:6px 0 0;font-size:14px;color:#3f3f46;line-height:1.6;white-space:pre-wrap;">${escapeHtml(customerReplyTruncated)}${customerReplySuffix}</p>
    </div>`,
          ctaLabel: "View ticket",
          ctaUrl: adminTicketUrl,
          footerNote: "You're receiving this because you are assigned to this support ticket.",
        }),
      });
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : "unknown";
      console.error("[jobs] admin reply email failed", msgErr);
    }

    return;
  }

  if (job.jobType === JOB_TYPES.SUPPORT_TICKET_ASSIGNED_NOTIFY) {
    const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
    const assigneeId = typeof payload.assigneeId === "string" ? payload.assigneeId : null;
    if (!ticketId || !assigneeId) throw new Error("invalid_payload");

    const [ticket, assignee] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          subject: true,
          ticketType: true,
          requesterEmail: true,
          requester: { select: { email: true, name: true } },
          tenant: { select: { name: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!ticket || !assignee?.email) return;

    const base = appUrl();
    const adminTicketUrl = base
      ? `${base}/admin/support?ticketId=${ticketId}`
      : `/admin/support?ticketId=${ticketId}`;

    const requesterLabel =
      ticket.requester?.email ?? ticket.requesterEmail ?? "An anonymous user";
    const workspaceLabel = ticket.tenant?.name ?? "No workspace (Sales inquiry)";
    const isSales = ticket.ticketType === "SALES_INQUIRY";

    await prisma.userNotification.create({
      data: {
        userId: assigneeId,
        notificationType: "support.ticket.assigned",
        title: "You were assigned a new support ticket",
        body: ticket.subject,
        entityType: "SupportTicket",
        entityId: ticketId,
        actionUrl: `/admin/support?ticketId=${ticketId}`,
      },
    });

    try {
      await sendTicketEmail({
        to: assignee.email,
        subject: `New ticket assigned to you: ${ticket.subject}`,
        html: buildSupportEmail({
          recipientName: assignee.name ?? "there",
          preheader: `New support ticket assigned to you: ${ticket.subject}`,
          bodyHtml: `
  <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
    A new support ticket has been assigned to you.
  </p>
  <div style="margin:16px 0 0;background:#f4f4f5;border-radius:8px;padding:14px 16px;">
    <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Ticket</p>
    <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${escapeHtml(ticket.subject)}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#3f3f46;">From: <strong>${escapeHtml(requesterLabel)}</strong></p>
    ${isSales ? "" : `<p style="margin:4px 0 0;font-size:13px;color:#3f3f46;">Workspace: <strong>${escapeHtml(workspaceLabel)}</strong></p>`}
  </div>`,
          ctaLabel: "View ticket",
          ctaUrl: adminTicketUrl,
          footerNote: "You're receiving this because this ticket was assigned to you.",
        }),
      });
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : "unknown";
      console.error("[jobs] assigned notify email failed", msgErr);
    }

    return;
  }

  if (job.jobType === JOB_TYPES.NOTIFICATION_CLEANUP) {
    await runNotificationCleanup();
    return;
  }

  throw new Error(`unknown_job_type:${job.jobType}`);
}

/**
 * Notification retention policy:
 *
 * Rule 1 — Hard delete read notifications older than 30 days.
 *   Read notifications are low value after 30 days. Deleting them keeps the
 *   table small and indexed queries fast regardless of user volume.
 *
 * Rule 2 — Hard delete ALL notifications (read or unread) older than 90 days.
 *   Prevents indefinite accumulation for users who never open the bell.
 *
 * Rule 3 — Per-user unread cap of 100.
 *   If a user has more than 100 unread notifications, mark the oldest ones
 *   as read (do not delete them — they still become visible as read for 30 days).
 *   This keeps the unread badge accurate and prevents badge inflation.
 *
 * Rule 4 — Per-user total cap of 200.
 *   If after the above cleanup a user still has more than 200 total notifications,
 *   delete the oldest ones beyond that cap.
 *   This is a hard safety net for extreme edge cases.
 *
 * All operations are logged with counts for observability.
 * All operations are idempotent — safe to run multiple times.
 */
async function runNotificationCleanup(): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Rule 1: delete read notifications older than 30 days
  const deletedRead = await prisma.userNotification.deleteMany({
    where: {
      readAt: { not: null, lt: thirtyDaysAgo },
    },
  });

  // Rule 2: delete ALL notifications older than 90 days
  const deletedOld = await prisma.userNotification.deleteMany({
    where: {
      createdAt: { lt: ninetyDaysAgo },
    },
  });

  // Rule 3: per-user unread cap of 100
  const heavyUnreadUsers = await prisma.userNotification.groupBy({
    by: ["userId"],
    where: { readAt: null },
    _count: { userId: true },
    having: { userId: { _count: { gt: 100 } } },
  });

  let cappedUnread = 0;
  for (const row of heavyUnreadUsers) {
    // Find the 101st oldest unread notification for this user (cutoff point)
    const cutoff = await prisma.userNotification.findMany({
      where: { userId: row.userId, readAt: null },
      orderBy: { createdAt: "desc" },
      skip: 100,
      take: 1,
      select: { createdAt: true },
    });
    if (!cutoff[0]) continue;

    const result = await prisma.userNotification.updateMany({
      where: {
        userId: row.userId,
        readAt: null,
        createdAt: { lte: cutoff[0]!.createdAt },
      },
      data: { readAt: now },
    });
    cappedUnread += result.count;
  }

  // Rule 4: per-user total cap of 200
  const heavyTotalUsers = await prisma.userNotification.groupBy({
    by: ["userId"],
    _count: { userId: true },
    having: { userId: { _count: { gt: 200 } } },
  });

  let deletedOverCap = 0;
  for (const row of heavyTotalUsers) {
    const cutoff = await prisma.userNotification.findMany({
      where: { userId: row.userId },
      orderBy: { createdAt: "desc" },
      skip: 200,
      take: 1,
      select: { createdAt: true },
    });
    if (!cutoff[0]) continue;

    const result = await prisma.userNotification.deleteMany({
      where: {
        userId: row.userId,
        createdAt: { lte: cutoff[0]!.createdAt },
      },
    });
    deletedOverCap += result.count;
  }

  // eslint-disable-next-line no-console
  console.warn("[notification-cleanup]", {
    deletedReadOlderThan30d: deletedRead.count,
    deletedOlderThan90d: deletedOld.count,
    cappedUnreadNotifications: cappedUnread,
    deletedOverTotalCap: deletedOverCap,
  });
}
