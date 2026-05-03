import "server-only";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { resetStaleWebhookDeliveries } from "@/server/webhooks/worker-stale";

export const dynamic = "force-dynamic";

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

  const result = await resetStaleWebhookDeliveries();
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
