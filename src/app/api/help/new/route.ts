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
import { prisma } from "@/server/db";
import { sendEmail } from "@/server/services/invitation-email";
import { checkHelpSalesInquiryLimit } from "@/server/support/support-rate-limits";

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

  return apiSuccess({ ticketId: ticket.id }, 201);
});
