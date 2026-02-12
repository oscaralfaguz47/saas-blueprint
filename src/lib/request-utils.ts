/**
 * Get the application base URL (origin) for building absolute links (e.g. invite links in emails).
 * Prefers the incoming request's host so links use the correct domain in production.
 */
export function getBaseUrlFromRequest(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = req.headers.get("host");

  const proto = forwardedProto ?? (req.url.startsWith("https") ? "https" : "http");
  const hostname = forwardedHost ?? host;
  if (hostname) {
    const origin = `${proto}://${hostname}`;
    try {
      new URL(origin);
      return origin;
    } catch {
      // fall through
    }
  }

  try {
    const url = new URL(req.url);
    if (url.origin && url.origin !== "null") return url.origin;
  } catch {
    // fall through
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
