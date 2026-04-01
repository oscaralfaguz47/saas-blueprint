import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { env } from "@/lib/env";
import { apiSuccess, apiError, withErrorHandler } from "@/lib/api-response";

const DEFINED_JOBS = ["billing-period-close", "billing-starter-overage", "background-jobs"] as const;
type JobId = (typeof DEFINED_JOBS)[number];

function isValidJobId(id: string): id is JobId {
  return (DEFINED_JOBS as readonly string[]).includes(id);
}

export const POST = withErrorHandler(
  async (_req: Request, context: { params: Promise<{ jobId: string }> }) => {
    const session = await getServerSession(authOptions);
    const authError = await requireAdminAuth(session, "admin.tenants.read");
    if (authError) return authError;

    const { jobId } = await context.params;

    if (!isValidJobId(jobId)) {
      return apiError("NOT_FOUND", 404, "Cron job not found");
    }

    const cronSecret = env.CRON_SECRET;
    if (!cronSecret) {
      return apiError("INTERNAL_ERROR", 500, "CRON_SECRET is not configured");
    }

    const baseUrl = env.NEXTAUTH_URL ?? "http://localhost:3000";

    const cronEndpoints: Record<JobId, string> = {
      "billing-period-close": `${baseUrl}/api/internal/cron/billing/period-close`,
      "billing-starter-overage": `${baseUrl}/api/internal/cron/billing/starter-overage`,
      "background-jobs": `${baseUrl}/api/internal/cron/jobs`,
    };

    const endpoint = cronEndpoints[jobId];

    const startedAt = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(120_000),
      });

      const durationMs = Date.now() - startedAt;
      let resultData: unknown = null;
      try {
        resultData = await res.json();
      } catch {
        resultData = null;
      }

      if (!res.ok) {
        return apiSuccess({
          jobId,
          status: "error" as const,
          httpStatus: res.status,
          durationMs,
          result: resultData,
        });
      }

      return apiSuccess({
        jobId,
        status: "ok" as const,
        httpStatus: res.status,
        durationMs,
        result: resultData,
      });
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      return apiSuccess({
        jobId,
        status: "error" as const,
        httpStatus: 0,
        durationMs,
        result: {
          error: isTimeout ? "Job timed out after 120s" : e instanceof Error ? e.message : "Unknown error",
        },
      });
    }
  }
);
