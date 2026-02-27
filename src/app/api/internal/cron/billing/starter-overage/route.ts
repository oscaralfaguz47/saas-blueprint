import "server-only";

import { NextResponse } from "next/server";
import { runStarterOverageScheduling } from "@/server/billing/overage/schedule-starter-overage";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";

const CRON_SECRET = process.env.CRON_SECRET;

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

/** EPIC 5: Cron entrypoint for Starter overage scheduling. GET with CRON_SECRET. */
export const GET = withErrorHandler(async (req: Request) => {
  if (!isCronAuthorized(req)) {
    return withCronHeaders(apiError("UNAUTHORIZED", 401, "Invalid or missing cron secret"));
  }
  const result = await runStarterOverageScheduling();
  return withCronHeaders(apiSuccess({ scheduled: result.scheduled }));
});

export const POST = withErrorHandler(async (req: Request) => {
  if (!isCronAuthorized(req)) {
    return withCronHeaders(apiError("UNAUTHORIZED", 401, "Invalid or missing cron secret"));
  }
  const result = await runStarterOverageScheduling();
  return withCronHeaders(apiSuccess({ scheduled: result.scheduled }));
});
