import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { checkAdminWorkspaceDetailLimit } from "@/server/security/admin-rate-limit";
import { getSubscriptionPaymentMethod } from "@/server/billing/providers/paddle/get-subscription-payment-method";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const GET = withErrorHandler(
  async (_req: Request, context: { params: Promise<{ tenantId: string }> }) => {
    const session = await getServerSession(authOptions);
    const authError = await requireAdminAuth(session, "admin.billing.read");
    if (authError) return authError;
    if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

    const rl = await checkAdminWorkspaceDetailLimit(session.user.id);
    if (!rl.allowed)
      return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
        retryAfterSeconds: rl.retryAfterSeconds,
      });

    const { tenantId } = paramsSchema.parse(await context.params);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) return ApiErrors.NOT_FOUND("Workspace");

    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, provider: "paddle" },
      select: { providerCustomerId: true, providerSubscriptionId: true },
    });

    if (!subscription?.providerCustomerId) {
      return apiSuccess({ paymentMethod: null });
    }

    const paymentMethod = await getSubscriptionPaymentMethod({
      providerCustomerId: subscription.providerCustomerId,
      providerSubscriptionId: subscription.providerSubscriptionId ?? undefined,
    });

    return apiSuccess({ paymentMethod });
  }
);
