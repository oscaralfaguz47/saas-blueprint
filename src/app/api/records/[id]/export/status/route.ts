import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { canAccessRequest } from "@/server/security/request-authorization";
import { buildRecordExportObjectPrefix } from "@/server/services/r2-profile-photo";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });
const querySchema = z.object({ jobId: z.string().cuid() });

function clientJobStatus(dbStatus: string): string {
  if (dbStatus === "DONE") return "COMPLETED";
  return dbStatus;
}

/**
 * GET /api/records/[id]/export/status?jobId=…
 * Poll export background job; signed download URL when finished.
 */
export const GET = withErrorHandler(async (
  req: Request,
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

  const url = new URL(req.url);
  const queryResult = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!queryResult.success) return ApiErrors.VALIDATION_ERROR("Invalid jobId");
  const { jobId } = queryResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const job = await prisma.backgroundJob.findFirst({
    where: { id: jobId, tenantId },
    select: {
      id: true,
      status: true,
      jobType: true,
      lastError: true,
      processedAt: true,
      createdAt: true,
    },
  });
  if (!job) return ApiErrors.NOT_FOUND("Export job");

  const statusOut = clientJobStatus(job.status);

  if (job.status !== "DONE") {
    return apiSuccess({
      jobId: job.id,
      status: statusOut,
      errorMessage:
        job.status === "FAILED" ? "Export failed. Please try again." : null,
    });
  }

  const prefix = buildRecordExportObjectPrefix(tenantId, recordId, jobId);
  const exportRecord = await prisma.recordExport.findFirst({
    where: { tenantId, recordId, objectKey: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      exportType: true,
      objectKey: true,
      fileName: true,
      watermarkApplied: true,
      createdAt: true,
    },
  });

  if (!exportRecord) {
    return apiSuccess({
      jobId: job.id,
      status: statusOut,
      downloadUrl: null,
    });
  }

  let downloadUrl: string | null = null;
  try {
    const { getPresignedGetUrlProfilePhoto } = await import("@/server/services/r2-profile-photo");
    downloadUrl = await getPresignedGetUrlProfilePhoto(exportRecord.objectKey);
  } catch {
    // non-fatal
  }

  return apiSuccess({
    jobId: job.id,
    status: statusOut,
    export: {
      id: exportRecord.id,
      exportType: exportRecord.exportType,
      fileName: exportRecord.fileName,
      watermarkApplied: exportRecord.watermarkApplied,
      createdAt: exportRecord.createdAt,
    },
    downloadUrl,
    processedAt: job.processedAt,
  });
});
