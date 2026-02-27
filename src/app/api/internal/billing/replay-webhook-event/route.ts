import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { prisma } from "@/server/db";
import { handleWebhookEvent } from "@/server/billing/providers/paddle/handle-webhook-event";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations/common";
import { z } from "zod";

const bodySchema = z.object({
  providerEventId: z.string().min(1).max(191),
});

/**
 * POST /api/internal/billing/replay-webhook-event
 * Platform-only: re-run business logic for a stored BillingEvent (idempotent).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return apiError("UNAUTHORIZED", 401, "Authentication required");
  }

  const allowed = await hasVendorPermission({
    userId: session.user.id,
    legacyRole: session.user.role,
    permission: "admin.tenants.read",
  });
  if (!allowed) {
    return apiError("FORBIDDEN", 403, "Platform admin only");
  }

  const body = await parseBody(req, bodySchema);

  const event = await prisma.billingEvent.findUnique({
    where: { providerEventId: body.providerEventId },
    select: { payload: true, type: true },
  });
  if (!event) {
    return apiError("NOT_FOUND", 404, "Event not found");
  }

  const envelope = event.payload as { event_id?: string; event_type?: string; data?: unknown };
  const eventId = envelope?.event_id ?? body.providerEventId;
  const eventType = envelope?.event_type ?? event.type;

  const result = await handleWebhookEvent({
    rawBody: JSON.stringify(envelope),
    envelope: { event_id: eventId, event_type: eventType, data: envelope?.data ?? {} },
  });

  return apiSuccess({
    replayed: true,
    processed: result.processed,
    tenantMismatch: result.tenantMismatch ?? false,
  });
});
