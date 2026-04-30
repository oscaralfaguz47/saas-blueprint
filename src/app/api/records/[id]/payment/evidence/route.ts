import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const addPaymentEvidenceSchema = z.discriminatedUnion("evidenceType", [
  z.object({
    evidenceType: z.literal("TEXT"),
    label: z.string().max(255).trim().optional(),
    contentText: z.string().min(1).max(5000).trim(),
  }),
  z.object({
    evidenceType: z.literal("LINK"),
    label: z.string().min(1).max(255).trim(),
    url: z
      .string()
      .url()
      .max(2048)
      .refine(
        (v) => v.startsWith("http://") || v.startsWith("https://"),
        "Only http/https URLs allowed"
      ),
  }),
]);

/**
 * POST /api/records/[id]/payment/evidence
 * H2 — Append TEXT/LINK payment evidence with monotonic versionNumber (same transaction).
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

  const canManage = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.payments.manage",
  });
  if (!canManage) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true, requestedAmount: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot add payment evidence to a closed record.");
  }
  const effectiveAmount =
    record.requestedAmount != null ? Number(record.requestedAmount) : null;

  if (!effectiveAmount || effectiveAmount <= 0) {
    return ApiErrors.VALIDATION_ERROR(
      "Payment tracking is only available for requests with a requested amount."
    );
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = addPaymentEvidenceSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const body = bodyResult.data;

  const evidence = await prisma.$transaction(async (tx) => {
    let payment = await tx.recordPayment.findUnique({
      where: { recordId },
      select: { id: true },
    });
    if (!payment) {
      payment = await tx.recordPayment.create({
        data: {
          tenantId,
          recordId,
          status: "NOT_PAID",
          setAt: new Date(),
          setByUserId: session.user.id,
        },
        select: { id: true },
      });
    }

    const agg = await tx.recordPaymentEvidence.aggregate({
      where: { paymentId: payment.id },
      _max: { versionNumber: true },
    });
    const versionNumber = (agg._max.versionNumber ?? 0) + 1;

    const ev = await tx.recordPaymentEvidence.create({
      data: {
        tenantId,
        recordId,
        paymentId: payment.id,
        evidenceType: body.evidenceType,
        label: body.evidenceType === "TEXT" ? body.label ?? null : body.label,
        contentText: body.evidenceType === "TEXT" ? body.contentText : null,
        url: body.evidenceType === "LINK" ? body.url : null,
        versionNumber,
        createdByUserId: session.user.id,
      },
      select: {
        id: true,
        evidenceType: true,
        label: true,
        versionNumber: true,
        createdAt: true,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "PAYMENT_EVIDENCE_ADDED",
        actorUserId: session.user.id,
        metadata: {
          evidenceId: ev.id,
          evidenceType: body.evidenceType,
          versionNumber,
          label: body.evidenceType !== "TEXT" ? body.label : (body.label ?? null),
          contentText: body.evidenceType === "TEXT" ? body.contentText : null,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.payment.evidence_added",
        targetType: "RecordPaymentEvidence",
        targetId: ev.id,
        metadata: { recordId, evidenceType: body.evidenceType, versionNumber },
      },
    });

    return ev;
  });

  return apiSuccess(evidence, 201);
});
