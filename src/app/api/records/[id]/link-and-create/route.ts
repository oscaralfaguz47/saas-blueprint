import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { checkMeterLimit, tryConsumeMeter } from "@/server/billing/try-consume-meter";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { createRecordSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

/**
 * POST /api/records/[id]/link-and-create
 * G2 — Create a new record B and link B → A (FULFILLS). Consumes one REQUESTS meter unit after success.
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
  const { id: sourceRecordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: sourceRecordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const source = await prisma.record.findFirst({
    where: { id: sourceRecordId, tenantId },
    select: { status: true },
  });
  if (!source) return ApiErrors.NOT_FOUND("Record");
  if (source.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot create a linked record from a closed record.");
  }

  const [canCreate, canLink] = await Promise.all([
    hasTenantPermission({ userId: session.user.id, tenantId, permission: "tenant.requests.create" }),
    hasTenantPermission({ userId: session.user.id, tenantId, permission: "tenant.requests.link" }),
  ]);
  if (!canCreate || !canLink) return ApiErrors.FORBIDDEN();

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = createRecordSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const body = bodyResult.data;

  await checkMeterLimit({ tenantId, meter: "REQUESTS", delta: 1 });

  const { newRecord, link } = await prisma.$transaction(async (tx) => {
    const record = await tx.record.create({
      data: {
        tenantId,
        createdByUserId: session.user.id,
        title: body.title,
        type: body.type,
        description: body.description ?? null,
        clientName: body.clientName ?? null,
        clientEmail: body.clientEmail ?? null,
        amount: body.amount != null ? body.amount : null,
        currency: body.currency ?? null,
        visibility: body.visibility,
        isSensitive: body.isSensitive,
        status: "OPEN",
      },
      select: { id: true, title: true, type: true, status: true, createdAt: true },
    });

    const l = await tx.recordLink.create({
      data: {
        tenantId,
        linkType: "FULFILLS",
        fromRecordId: record.id,
        toRecordId: sourceRecordId,
        createdByUserId: session.user.id,
      },
      select: { id: true },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId: record.id,
        eventType: "RECORD_CREATED",
        actorUserId: session.user.id,
        metadata: { title: record.title, type: record.type, sourceRecordId },
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId: record.id,
        eventType: "RECORD_LINKED",
        actorUserId: session.user.id,
        metadata: {
          linkId: l.id,
          linkType: "FULFILLS",
          fromRecordId: record.id,
          toRecordId: sourceRecordId,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.created",
        targetType: "Record",
        targetId: record.id,
        metadata: { title: record.title, recordType: record.type, sourceRecordId },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: session.user.id,
        actorContext: "TENANT",
        tenantId,
        action: "record.linked",
        targetType: "RecordLink",
        targetId: l.id,
        metadata: { recordId: record.id, toRecordId: sourceRecordId, linkType: "FULFILLS" },
      },
    });

    return { newRecord: record, link: l };
  });

  await tryConsumeMeter({
    tenantId,
    meter: "REQUESTS",
    delta: 1,
    idempotencyKey: `record.created.${newRecord.id}`,
    sourceType: "record.created",
    sourceId: newRecord.id,
    actorUserId: session.user.id,
  });

  return apiSuccess({ record: newRecord, linkId: link.id }, 201);
});
