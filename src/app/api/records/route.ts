import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { writeAuditLog } from "@/server/services/audit";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { tryConsumeMeter } from "@/server/billing/try-consume-meter";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, createRecordSchema } from "@/lib/validations";
import { randomUUID } from "crypto";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

  const tenantId = membership.tenant.id;
  const userId = session.user.id;

  // RBAC: users with tenant.requests.read_all see all records; others see only their own
  const canReadAll = await hasTenantPermission({
    userId,
    tenantId,
    permission: "tenant.requests.read_all",
  });

  const rows = await prisma.record.findMany({
    where: {
      tenantId,
      ...(!canReadAll ? { createdByUserId: userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, type: true, status: true, createdAt: true },
    take: 50,
  });

  return apiSuccess({ records: rows });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  // isPlatformBlocked check
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (user?.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

  const body = await parseBody(req, createRecordSchema);

  // Plan gating: consume a REQUESTS meter unit before creating the record
  await tryConsumeMeter({
    tenantId: membership.tenant.id,
    meter: "REQUESTS",
    delta: 1,
    idempotencyKey: `record-create-${randomUUID()}`,
    sourceType: "record",
    actorUserId: session.user.id,
  });

  const created = await prisma.record.create({
    data: {
      tenantId: membership.tenant.id,
      createdByUserId: session.user.id,
      title: body.title,
      type: body.type,
      description: body.description || null,
      clientName: body.clientName || null,
      clientEmail: body.clientEmail || null,
      amount: body.amount != null ? body.amount : null,
      currency: body.currency || null,
      visibility: body.visibility,
      isSensitive: body.isSensitive,
      status: "DRAFT",
    },
    select: { id: true },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: membership.tenant.id,
    action: "record.created",
    targetType: "Record",
    targetId: created.id,
  });

  return apiSuccess({ id: created.id }, 201);
});

