import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPeriodClose } from "@/server/billing/period-close";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";

const SECRET = env.BILLING_PERIOD_CLOSE_SECRET;

function isAuthorized(req: Request): boolean {
  if (!SECRET) return false;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7) === SECRET;
  }
  const headerSecret = req.headers.get("x-internal-secret");
  return headerSecret === SECRET;
}

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorized(req)) {
    return apiError("UNAUTHORIZED", 401, "Invalid or missing internal secret");
  }

  const result = await runPeriodClose({
    actorUserId: env.BILLING_WEBHOOK_ACTOR_USER_ID ?? null,
  });
  return apiSuccess({ closed: result.closed });
});
