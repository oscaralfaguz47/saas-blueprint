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
import { findLeastLoadedAdmin } from "@/server/support/support-auto-assign";
import { checkHelpSalesInquiryLimit } from "@/server/support/support-rate-limits";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildExternalConfirmationEmail(params: {
  email: string;
  subject: string;
  message: string;
}): string {
  const { subject, message } = params;
  const preview = message.slice(0, 500);
  const truncated = message.length > 500;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We received your message</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">We received your message and will get back to you shortly.&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
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
          <tr>
            <td style="background:#ffffff;border-radius:0 0 12px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:28px 32px 0;">
                    <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
                      Thanks for reaching out! We received your message and will get back to you within one business day.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px 0;">
                    <div style="background:#f4f4f5;border-radius:8px;padding:14px 16px;">
                      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#71717a;">Your message</p>
                      <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#09090b;">${escapeHtml(subject)}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 32px 0;">
                    <div style="border-left:3px solid #e4e4e7;padding:10px 16px;background:#fafafa;border-radius:0 6px 6px 0;">
                      <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.6;white-space:pre-wrap;">${escapeHtml(preview)}${truncated ? "…" : ""}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px 28px;">
                    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">
                      If you have additional information to add, simply reply to this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px 20px;background:#fafafa;border-top:1px solid #e4e4e7;">
                    <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                      You're receiving this because you submitted a message via Relitrue.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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
        html: `<p><strong>From:</strong> ${email}</p><p><strong>Subject:</strong> ${subject}</p><p>${message.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</p><p>Ticket ID: ${ticket.id}</p>`,
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
    });
  } catch (e) {
    console.error("[help/new] submitter_confirmation_email_failed", {
      ticketId: ticket.id,
      errorName: e instanceof Error ? e.name : "unknown",
    });
  }

  return apiSuccess({ ticketId: ticket.id }, 201);
});
