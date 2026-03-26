import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { processPendingBackgroundJobs } from "@/server/jobs/process-background-jobs";
import { enqueueBackgroundJob, JOB_TYPES } from "@/server/jobs/background-jobs";

const CRON_SECRET = env.CRON_SECRET;

function isCronAuthorized(req: Request): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

function withCronHeaders(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

async function handleCron(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return withCronHeaders(apiError("UNAUTHORIZED", 401, "Invalid or missing cron secret"));
  }

  const result = await processPendingBackgroundJobs();

  // Enqueue daily notification cleanup — idempotency key is date-scoped
  // so it runs at most once per UTC day regardless of how often cron fires.
  const todayKey = new Date().toISOString().slice(0, 10); // "2026-03-26"
  await enqueueBackgroundJob({
    jobType: JOB_TYPES.NOTIFICATION_CLEANUP,
    idempotencyKey: `notification:cleanup:${todayKey}`,
    payload: {},
    tenantId: null,
  });

  return withCronHeaders(apiSuccess(result));
}

export const GET = withErrorHandler(async (req: Request) => handleCron(req));

export const POST = withErrorHandler(async (req: Request) => {
  if (process.env.NODE_ENV === "production") {
    const res = NextResponse.json(
      { ok: false, error: "METHOD_NOT_ALLOWED", message: "Use GET for cron execution." },
      { status: 405 }
    );
    return withCronHeaders(res);
  }
  return handleCron(req);
});
