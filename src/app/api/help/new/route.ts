import {
  SupportMessageAuthorKind,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { env } from "@/lib/env";
import { getClientIp } from "@/server/http-client-ip";
import { JOB_TYPES, enqueueBackgroundJob } from "@/server/jobs/background-jobs";
import { prisma } from "@/server/db";
import { sendEmail } from "@/server/services/invitation-email";
import {
  buildEmailShell,
  buildHighlightBox,
  buildQuoteBlock,
  escapeHtml,
  resolveSender,
  EMAIL_THEME,
} from "@/server/services/email-templates";
import { findLeastLoadedAdmin } from "@/server/support/support-auto-assign";
import { checkHelpSalesInquiryLimit } from "@/server/support/support-rate-limits";

function buildExternalConfirmationEmail(params: {
  email: string;
  subject: string;
  message: string;
}): string {
  const { subject, message } = params;
  const preview = message.slice(0, 500);
  const truncated = message.length > 500;
  const t = EMAIL_THEME;
  const appName = env.APP_NAME ?? "Relitrue";
  const bodyHtml = `
    <p style="margin:0;font-size:15px;color:${t.colorTextBody};line-height:1.6;font-family:${t.fontStack};">
      Thanks for reaching out! We received your message and will get back to you within one business day.
    </p>
    ${buildHighlightBox(`
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;
                letter-spacing:0.5px;color:${t.colorTextMuted};font-family:${t.fontStack};">Your message</p>
      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:${t.colorTextPrimary};
                font-family:${t.fontStack};">${escapeHtml(subject)}</p>
    `)}
    ${buildQuoteBlock(`
      <p style="margin:0;font-size:14px;color:${t.colorTextBody};line-height:1.6;
                font-family:${t.fontStack};">${escapeHtml(preview)}${truncated ? "&#8230;" : ""}</p>
    `)}
    <p style="margin:16px 0 0;font-size:13px;color:${t.colorTextMuted};line-height:1.5;font-family:${t.fontStack};">
      If you have additional information to add, simply reply to this email.
    </p>`;

  return buildEmailShell({
    title: "We received your message",
    preheader: "We received your message and will get back to you shortly.",
    bodyHtml,
    footerNote: `You're receiving this because you submitted a message via ${appName}.`,
  });
}

function buildSalesInquiryAdminEmail(params: {
  email: string;
  subject: string;
  message: string;
  ticketId: string;
}): string {
  const t = EMAIL_THEME;
  const bodyHtml = `
    <p style="margin:0;font-size:15px;color:${t.colorTextBody};font-family:${t.fontStack};"><strong>From:</strong> ${escapeHtml(params.email)}</p>
    <p style="margin:12px 0 0;font-size:15px;color:${t.colorTextBody};font-family:${t.fontStack};"><strong>Subject:</strong> ${escapeHtml(params.subject)}</p>
    ${buildHighlightBox(`
      <p style="margin:0;font-size:14px;color:${t.colorTextBody};line-height:1.6;font-family:${t.fontStack};">${escapeHtml(params.message)}</p>
    `)}
    <p style="margin:12px 0 0;font-size:12px;color:${t.colorTextMuted};font-family:${t.fontStack};">Ticket ID: ${escapeHtml(params.ticketId)}</p>`;

  return buildEmailShell({
    title: `[Sales inquiry] ${params.subject}`,
    preheader: `Sales inquiry: ${params.subject}`,
    bodyHtml,
    footerNote: "You're receiving this because you are configured to receive sales inquiries.",
  });
}

const bodySchema = z.object({
  email: z.string().email().max(255),
  subject: z.string().min(1).max(255),
  message: z.string().min(1).max(4000),
});

const MAX_BODY = 12_000;

export const POST = withErrorHandler(async (req: Request) => {
  const ip = getClientIp(req);
  const rl = await checkHelpSalesInquiryLimit(ip);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return ApiErrors.UNSUPPORTED_MEDIA_TYPE();
  }

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > MAX_BODY) {
    return ApiErrors.PAYLOAD_TOO_LARGE();
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid JSON");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const email = parsed.data.email.trim();
  const subject = parsed.data.subject.trim();
  const message = parsed.data.message.trim();
  const preview = message.slice(0, 500);

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        ticketType: SupportTicketType.SALES_INQUIRY,
        tenantId: null,
        createdByUserId: null,
        requesterUserId: null,
        requesterEmail: email,
        subject,
        descriptionPreview: preview,
        priority: SupportTicketPriority.MEDIUM,
        status: SupportTicketStatus.OPEN,
        lastMessageAt: new Date(),
      },
    });

    await tx.supportTicketMessage.create({
      data: {
        ticketId: t.id,
        authorUserId: null,
        authorKind: SupportMessageAuthorKind.SYSTEM,
        bodyText: message,
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
      tenantId: null,
    });
  }

  const notifyTo = env.PLATFORM_ADMIN_EMAIL?.trim();
  if (notifyTo) {
    try {
      await sendEmail({
        to: notifyTo,
        subject: `[Sales inquiry] ${subject}`,
        html: buildSalesInquiryAdminEmail({
          email,
          subject,
          message,
          ticketId: ticket.id,
        }),
        from: resolveSender("support"),
      });
    } catch (e) {
      console.error("[help/new] sales_notification_failed", {
        ticketId: ticket.id,
        errorName: e instanceof Error ? e.name : "unknown",
      });
    }
  } else if (process.env.NODE_ENV === "development") {
    console.warn("[help/new] PLATFORM_ADMIN_EMAIL not set; skipping sales notification email");
  }

  // Send confirmation email to the submitter — best effort
  try {
    await sendEmail({
      to: email,
      subject: `We received your message: ${subject}`,
      html: buildExternalConfirmationEmail({ email, subject, message }),
      from: resolveSender("support"),
    });
  } catch (e) {
    console.error("[help/new] submitter_confirmation_email_failed", {
      ticketId: ticket.id,
      errorName: e instanceof Error ? e.name : "unknown",
    });
  }

  return apiSuccess({ ticketId: ticket.id }, 201);
});
