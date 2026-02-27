import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { getCurrentTenantId, requireTenantPermission } from "@/server/billing/tenant-context";
import { writeAuditLog } from "@/server/services/audit";
import { sendEmail } from "@/server/services/invitation-email";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { z } from "zod";

const postBodySchema = z.object({
  type: z.literal("INVOICE_BILLING_DETAILS_CHANGE"),
  providerInvoiceId: z.string().max(191).optional().nullable(),
  providerTransactionId: z.string().max(191).optional().nullable(),
  requestedData: z.record(z.string(), z.unknown()),
  note: z.string().max(500).optional().nullable(),
});

/**
 * POST /api/billing/support-requests
 * Create a billing support request (e.g. change billing details on existing invoice). Notifies platform admin.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const permError = await requireTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.billing.manage",
  });
  if (permError) return permError;

  const body = await parseBody(req, postBodySchema);

  const supportRequest = await prisma.billingSupportRequest.create({
    data: {
      tenantId,
      type: body.type,
      status: "OPEN",
      providerInvoiceId: body.providerInvoiceId ?? undefined,
      providerTransactionId: body.providerTransactionId ?? undefined,
      requestedData: body.requestedData as object,
      note: body.note ?? undefined,
      createdByUserId: session.user.id,
    },
    select: { id: true },
  });

  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length > 0) {
    try {
      await sendEmail({
        to: adminEmails[0],
        subject: "Billing support request: change invoice billing details",
        html: `<p>Tenant ${tenantId} requested a change to existing invoice billing details. Request ID: ${supportRequest.id}. Note: ${body.note ?? "—"}</p>`,
      });
    } catch {
      // non-blocking
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId,
    action: "tenant.billing.support_request_created",
    targetType: "BillingSupportRequest",
    targetId: supportRequest.id,
    metadata: { type: body.type },
  });

  return apiSuccess({ id: supportRequest.id });
});
