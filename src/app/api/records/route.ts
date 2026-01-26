import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, createRecordSchema } from "@/lib/validations";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

  const rows = await prisma.record.findMany({
    where: { tenantId: membership.tenant.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, type: true, status: true, createdAt: true },
    take: 50,
  });

  return apiSuccess({ records: rows });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();

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
