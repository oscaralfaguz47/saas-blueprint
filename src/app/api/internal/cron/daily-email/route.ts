import "server-only";

import { NextResponse } from "next/server";
import { sendEmail } from "@/server/services/invitation-email";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";

const CRON_SECRET = process.env.CRON_SECRET;
const CRON_EMAIL_TO = process.env.CRON_EMAIL_TO;

const LOG_PREFIX = "[cron/daily-email]";

/**
 * Validates that the request is authorized for cron execution.
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET> when invoking cron jobs
 * when CRON_SECRET is set in project environment variables.
 */
function isCronAuthorized(req: Request): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

/** Add hardening headers to cron JSON responses. */
function withCronHeaders(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

/**
 * Shared cron handler: validates CRON_SECRET, requires CRON_EMAIL_TO, sends email, returns JSON.
 * Used by GET (production cron) and by POST in non-production (manual testing).
 */
async function handleCron(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return withCronHeaders(apiError("UNAUTHORIZED", 401, "Invalid or missing cron secret"));
  }

  const to = CRON_EMAIL_TO?.trim();
  if (!to) {
    return withCronHeaders(apiError("VALIDATION_ERROR", 400, "CRON_EMAIL_TO is not set"));
  }

  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, "Execution started");

  try {
    const nowUtc = new Date();
    const timeStr = nowUtc.toISOString();

    await sendEmail({
      to,
      subject: "Cron test successful",
      html: `<p>Your Vercel cron job executed successfully at <strong>${timeStr}</strong> (UTC).</p>`,
    });

    // eslint-disable-next-line no-console
    console.log(LOG_PREFIX, "Success", { sentAt: timeStr });

    return withCronHeaders(
      apiSuccess({
        ok: true,
        sentAt: timeStr,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(LOG_PREFIX, "Error", message);
    return withCronHeaders(apiError("INTERNAL_ERROR", 500, message));
  }
}

/**
 * Daily cron: sends a test email at 08:00 UTC.
 *
 * BILLING OVERAGE PATTERN: This same cron pattern can be reused for billing overage calculations:
 * - Add another cron in vercel.json (e.g. "0 9 * * *" for 09:00 UTC) pointing to /api/internal/cron/billing-overage.
 * - That route would: 1) validate CRON_SECRET the same way, 2) run server-only: iterate tenants (or last closed
 *   period), compute overage from TenantUsageMonthly vs plan limits, 3) persist overage records or send alerts
 *   via sendEmail to workspace admins. Keep the handler idempotent (safe to retry) and use transactions for DB writes.
 */

/** Official cron entrypoint: Vercel Cron uses GET. */
export const GET = withErrorHandler(async (req: Request) => handleCron(req));

/**
 * POST allowed only in non-production for manual testing (e.g. Postman).
 * In production, cron must use GET.
 */
export const POST = withErrorHandler(async (req: Request) => {
  if (process.env.NODE_ENV === "production") {
    const res = NextResponse.json(
      {
        ok: false,
        error: "METHOD_NOT_ALLOWED",
        message: "Use GET for cron execution.",
      },
      { status: 405 }
    );
    return withCronHeaders(res);
  }
  return handleCron(req);
});
