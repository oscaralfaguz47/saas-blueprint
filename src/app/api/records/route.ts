import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, createRecordSchema } from "@/lib/validations";
import { tryConsumeMeter } from "@/server/billing/try-consume-meter";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

  // RBAC: users with tenant.requests.read_all see all records;
  // others see only records they created.
  const canReadAll = await hasTenantPermission({
    userId: session.user.id,
    tenantId: membership.tenant.id,
    permission: "tenant.requests.read_all",
  });

  const rows = await prisma.record.findMany({
    where: {
      tenantId: membership.tenant.id,
      ...(!canReadAll ? { createdByUserId: session.user.id } : {}),
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

  // Fix 4: Check if the user is platform-blocked
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

  // RBAC: require tenant.requests.create permission
  const canCreate = await hasTenantPermission({
    userId: session.user.id,
    tenantId: membership.tenant.id,
    permission: "tenant.requests.create",
  });
  if (!canCreate) return ApiErrors.FORBIDDEN();

  // Fix 3: Enforce plan limits before creating a record
  // tryConsumeMeter throws UpgradeRequiredError if the hard cap is reached
  const idempotencyKey = crypto.randomUUID();
  await tryConsumeMeter({
    tenantId: membership.tenant.id,
    meter: "REQUESTS",
    delta: 1,
    idempotencyKey,
    sourceType: "record.created",
    actorUserId: session.user.id,
  });

  const body = await parseBody(req, createRecordSchema);

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
