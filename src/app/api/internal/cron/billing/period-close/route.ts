import "server-only";

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPeriodClose } from "@/server/billing/period-close";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";

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

/** EPIC 5: Cron entrypoint for period close. GET with CRON_SECRET. */
export const GET = withErrorHandler(async (req: Request) => {
  if (!isCronAuthorized(req)) {
    return withCronHeaders(apiError("UNAUTHORIZED", 401, "Invalid or missing cron secret"));
  }
  const result = await runPeriodClose({
    actorUserId: env.BILLING_WEBHOOK_ACTOR_USER_ID ?? null,
  });
  return withCronHeaders(apiSuccess({ closed: result.closed }));
});

export const POST = withErrorHandler(async (req: Request) => {
  if (!isCronAuthorized(req)) {
    return withCronHeaders(apiError("UNAUTHORIZED", 401, "Invalid or missing cron secret"));
  }
  const result = await runPeriodClose({
    actorUserId: env.BILLING_WEBHOOK_ACTOR_USER_ID ?? null,
  });
  return withCronHeaders(apiSuccess({ closed: result.closed }));
});
