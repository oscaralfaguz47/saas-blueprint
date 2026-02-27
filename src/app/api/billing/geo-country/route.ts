import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { authOptions } from "@/server/auth-options";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

/**
 * GET /api/billing/geo-country
 *
 * Returns the request's inferred country code (from Vercel/Cloudflare geo headers)
 * for prefilling checkout "Your details" default country. Requires auth.
 * Does not use saved billing address — only request location.
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const h = await headers();
  const vercel = h.get("x-vercel-ip-country");
  const cf = h.get("cf-ipcountry");
  const raw = vercel ?? cf ?? null;
  const countryCode =
    raw && /^[A-Za-z]{2}$/.test(raw.trim()) ? raw.trim().toUpperCase() : null;

  return apiSuccess({ countryCode });
});
