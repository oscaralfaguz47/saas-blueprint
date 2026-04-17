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
import { z } from "zod";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const paramsSchema = z.object({ id: z.string().cuid() });

const assignInternalSchema = z.object({
  userId: z.string().cuid("Invalid user id"),
  participantRole: z.enum(["APPROVER", "VIEWER"]).default("APPROVER"),
});

/**
 * GET /api/records/[id]/participants
 * List all participants for a record (internal + external).
 * External tokens are NEVER returned — only status.
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

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

  const participants = await prisma.recordParticipant.findMany({
    where: { recordId, tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      participantType: true,
      participantRole: true,
      status: true,
      userId: true,
      email: true,
      name: true,
      expiresAt: true,
      revokedAt: true,
      respondedAt: true,
      createdAt: true,
    },
  });

  return apiSuccess({ participants });
});

/**
 * POST /api/records/[id]/participants
 * E1 — Assign an internal participant (approver or viewer).
 * Requires C1 access + tenant.approvals.assign_internal.
 * Blocked if record is CLOSED.
 * Idempotent: same userId+role returns existing record without error.
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
    permission: "tenant.approvals.assign_internal",
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
  const bodyResult = assignInternalSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { userId: targetUserId, participantRole } = bodyResult.data;

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId: targetUserId } },
    select: { status: true },
  });
  if (!targetMembership || targetMembership.status !== "ACTIVE") {
    return ApiErrors.VALIDATION_ERROR("User is not an active member of this workspace.");
  }

  const existing = await prisma.recordParticipant.findUnique({
    where: {
      recordId_userId_participantRole: {
        recordId,
        userId: targetUserId,
        participantRole,
      },
    },
    select: { id: true, status: true },
  });

  if (existing) {
    return apiSuccess({ id: existing.id, alreadyAssigned: true }, 200);
  }

  const participant = await prisma.$transaction(async (tx) => {
    const p = await tx.recordParticipant.create({
      data: {
        tenantId,
        recordId,
        participantType: "INTERNAL",
        participantRole,
        userId: targetUserId,
        status: "PENDING",
        createdByUserId: session.user.id,
      },
      select: {
        id: true,
        participantType: true,
        participantRole: true,
        status: true,
        createdAt: true,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "APPROVAL_REQUESTED",
        actorUserId: session.user.id,
        metadata: {
          participantId: p.id,
          approverUserId: targetUserId,
          participantRole,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.approval.internal_assigned",
        targetType: "RecordParticipant",
        targetId: p.id,
        metadata: { recordId, approverUserId: targetUserId, participantRole },
      },
    });

    return p;
  });

  if (participantRole === "APPROVER") {
    const [targetUser, recordForEmail] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: { email: true, name: true },
      }),
      prisma.record.findUnique({
        where: { id: recordId },
        select: { title: true, recordKey: true },
      }),
    ]);

    if (targetUser?.email) {
      const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
      const requestLink = appUrl
        ? `${appUrl}/app/requests/${recordId}`
        : `/app/requests/${recordId}`;
      const requestLabel =
        recordForEmail?.recordKey ?? recordForEmail?.title ?? "a financial request";
      const userName = targetUser.name ?? targetUser.email;

      try {
        await sendEmail({
          to: targetUser.email,
          subject: `Your approval is needed: ${requestLabel}`,
          html: `
        <p>Hello ${escapeHtml(userName)},</p>
        <p>You have been assigned as an approver for <strong>${escapeHtml(requestLabel)}</strong>.</p>
        <p><a href="${requestLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View and approve request</a></p>
        <p style="color:#6b7280;font-size:12px;">You can approve or reject the request after signing in to your account.</p>
      `,
        });
      } catch (emailErr) {
        console.error("[internal-approver] failed to send notification email:", emailErr);
      }
    }
  }

  return apiSuccess(participant, 201);
});
