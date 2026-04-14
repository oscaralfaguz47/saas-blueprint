import "server-only";

import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { checkMeterLimit } from "@/server/billing/try-consume-meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { enqueueBackgroundJobReturning, JOB_TYPES } from "@/server/jobs/background-jobs";
import { isR2Configured } from "@/server/services/r2-profile-photo";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

/**
 * POST /api/records/[id]/export
 * I1 — Enqueue PDF approval packet (background job; no inline generation).
 */
export const POST = withErrorHandler(async (
  _req: Request,
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

  const canExport = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.export",
  });
  if (!canExport) return ApiErrors.FORBIDDEN();

  if (!isR2Configured()) {
    return apiError("SERVICE_UNAVAILABLE", 503, "Export storage is not configured.");
  }

  const plan = await resolveTenantPlan(tenantId);
  if (plan.features.pdf.included === 0 && plan.features.pdf.hardCap) {
    return ApiErrors.UPGRADE_REQUIRED("PDF export is not available on your current plan.");
  }

  await checkMeterLimit({ tenantId, meter: "PDF_EXPORTS", delta: 1 });

  const rl = await checkRateLimit(`export:pdf:${session.user.id}:${recordId}`, 3, 60 * 1000);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Export already in progress. Please wait.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const job = await enqueueBackgroundJobReturning({
    tenantId,
    jobType: JOB_TYPES.EXPORT_PDF,
    idempotencyKey: `export:pdf:${tenantId}:${recordId}:${randomUUID()}`,
    payload: {
      recordId,
      requestedByUserId: session.user.id,
      watermark: plan.features.pdf.watermark,
    },
  });

  return apiSuccess({ jobId: job.id, status: "QUEUED" }, 202);
});
