import { NextRequest } from "next/server";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { claimSlugSchema } from "@/lib/validations";
import { isSlugAvailable } from "@/server/services/tenancy-bootstrap";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

const ipCounts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/** GET /api/workspaces/check-slug?slug=... — A5: check slug availability, rate limited */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) return ApiErrors.RATE_LIMITED("Too many slug checks. Try again in a minute.");

  const url = new URL(req.url);
  const slugParam = url.searchParams.get("slug")?.trim();
  if (slugParam == null || slugParam === "") {
    return ApiErrors.VALIDATION_ERROR("Query parameter 'slug' is required");
  }

  let slug: string;
  try {
    slug = claimSlugSchema.parse(slugParam);
  } catch {
    return ApiErrors.VALIDATION_ERROR(
      "Slug must be 3–80 characters, lowercase letters, numbers, and hyphens only (no leading/trailing/consecutive hyphens)"
    );
  }

  const available = await isSlugAvailable(slug);
  return apiSuccess({ available });
});
