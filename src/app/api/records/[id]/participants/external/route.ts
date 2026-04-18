import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { env } from "@/lib/env";
import { sendEmail } from "@/server/services/invitation-email";
import {
  buildEmailShell,
  buildCtaButton,
  buildHighlightBox,
  escapeHtml,
  resolveSender,
  EMAIL_THEME,
} from "@/server/services/email-templates";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";

const paramsSchema = z.object({ id: z.string().cuid() });

const assignExternalSchema = z.object({
  email: z
    .string()
    .email("Invalid email")
    .trim()
    .transform((s) => s.toLowerCase()),
  name: z.string().max(120).trim().optional(),
  expiresInHours: z.number().int().min(1).max(720).default(72),
});

/**
 * POST /api/records/[id]/participants/external
 * E3 — Assign an external approver.
 * Generates a secure token, stores only the SHA-256 hash.
 * Returns the plain token ONCE for embedding in the email link.
 * Requires tenant.approvals.assign_external.
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const canAssign = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.approvals.assign_external",
  });
  if (!canAssign) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot assign approvers to a closed record.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = assignExternalSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { email, name, expiresInHours } = bodyResult.data;

  const plainToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(plainToken).digest("hex");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const participant = await prisma.$transaction(async (tx) => {
    const p = await tx.recordParticipant.create({
      data: {
        tenantId,
        recordId,
        participantType: "EXTERNAL",
        participantRole: "APPROVER",
        email,
        name: name ?? null,
        tokenHash,
        expiresAt,
        status: "PENDING",
        createdByUserId: session.user.id,
      },
      select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "APPROVAL_REQUESTED",
        actorUserId: session.user.id,
        metadata: {
          participantId: p.id,
          participantType: "EXTERNAL",
          approverEmail: email,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.approval.external_sent",
        targetType: "RecordParticipant",
        targetId: p.id,
        metadata: { recordId, approverEmail: email },
      },
    });

    return p;
  });

  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const approvalLink = appUrl
    ? `${appUrl}/api/v1/external/approvals/${plainToken}`
    : `/api/v1/external/approvals/${plainToken}`;

  const recordForEmail = await prisma.record.findUnique({
    where: { id: recordId },
    select: { title: true, recordKey: true },
  });

  const requestLabel =
    recordForEmail?.recordKey ?? recordForEmail?.title ?? "a financial request";

  const t = EMAIL_THEME;
  const expiryDate = (participant.expiresAt ?? expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const bodyHtml = `
    <p style="margin:0;font-size:15px;color:${t.colorTextBody};">
      Hello${name ? ` <strong>${escapeHtml(name)}</strong>` : ""},
    </p>
    <p style="margin:12px 0 0;font-size:15px;color:${t.colorTextBody};">
      You have been requested to review and approve:
    </p>
    ${buildHighlightBox(`
      <p style="margin:0;font-size:15px;font-weight:600;color:${t.colorTextPrimary};font-family:${t.fontStack};">${escapeHtml(requestLabel)}</p>
    `)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border-collapse:collapse;margin-top:24px;">
      <tr>
        <td align="center" style="padding:0;">
          ${buildCtaButton("Review and approve", approvalLink)}
        </td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-size:12px;color:${t.colorTextMuted};">
      This link expires on ${escapeHtml(expiryDate)}.
    </p>`;

  try {
    await sendEmail({
      to: email,
      subject: `Your approval is requested: ${requestLabel}`,
      html: buildEmailShell({
        title: `Approval requested: ${requestLabel}`,
        preheader: `You have been asked to approve ${requestLabel}`,
        bodyHtml,
        footerNote: "If you were not expecting this request, you can safely ignore this email.",
      }),
      from: resolveSender("notifications"),
    });
  } catch (emailErr) {
    console.error("[external-approver] failed to send approval email:", emailErr);
  }

  return apiSuccess(
    {
      participantId: participant.id,
      email: participant.email,
      expiresAt: participant.expiresAt,
      approvalToken: plainToken,
      approvalLinkBase: `/api/v1/external/approvals/${plainToken}`,
    },
    201
  );
});
