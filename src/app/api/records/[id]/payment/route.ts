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

const PAYABLE_TYPES = ["BUDGET"] as const;

const setPaymentStatusSchema = z.object({
  status: z.enum(["NOT_PAID", "PENDING", "PAID"]),
});

function isPayableType(type: string): boolean {
  return (PAYABLE_TYPES as readonly string[]).includes(type);
}

/**
 * GET /api/records/[id]/payment
 * Current payment row + active evidence summary.
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

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { type: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (!isPayableType(record.type)) {
    return ApiErrors.VALIDATION_ERROR("Payment is not supported for this record type.");
  }

  const payment = await prisma.recordPayment.findUnique({
    where: { recordId },
    select: {
      id: true,
      status: true,
      setAt: true,
      setByUserId: true,
      evidence: {
        where: { removedAt: null },
        select: { id: true, evidenceType: true, label: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const missingProof =
    payment?.status === "PAID" && (payment.evidence?.length ?? 0) === 0;

  return apiSuccess({ payment: payment ?? null, missingProof });
});

/**
 * POST /api/records/[id]/payment
 * H1 — Upsert payment status (one row per record).
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
    select: { type: true, status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot change payment on a closed record.");
  }
  if (!isPayableType(record.type)) {
    return ApiErrors.VALIDATION_ERROR("Payment is not supported for this record type.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = setPaymentStatusSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { status } = bodyResult.data;

  const payment = await prisma.$transaction(async (tx) => {
    const cur = await tx.recordPayment.findUnique({
      where: { recordId },
      select: { id: true, status: true, setAt: true },
    });

    if (cur?.status === status) {
      return { id: cur.id, status: cur.status, setAt: cur.setAt };
    }

    const previousStatus = cur?.status ?? null;
    const setAt = new Date();

    const p = await tx.recordPayment.upsert({
      where: { recordId },
      create: {
        tenantId,
        recordId,
        status,
        setAt,
        setByUserId: session.user.id,
      },
      update: {
        status,
        setAt,
        setByUserId: session.user.id,
      },
      select: { id: true, status: true, setAt: true },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "PAYMENT_STATUS_SET",
        actorUserId: session.user.id,
        metadata: { previousStatus, newStatus: status },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.payment.status_set",
        targetType: "RecordPayment",
        targetId: p.id,
        metadata: { recordId, previousStatus, newStatus: status },
      },
    });

    return p;
  });

  return apiSuccess(payment);
});
