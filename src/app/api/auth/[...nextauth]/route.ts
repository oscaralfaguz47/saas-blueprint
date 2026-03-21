import NextAuth from "next-auth";
import {
  authOptions,
  setPendingRequestMeta,
  setEventsRequestMeta,
} from "@/server/auth-options";
import { runWithNextAuthCookieHeaderAsync } from "@/server/nextauth-cookie-header";

const handler = NextAuth(authOptions);

/** NextAuth picks App Router vs Pages API by `context.params`; omitting it breaks sign-in (req.query undefined). */
type NextAuthContext = { params: Promise<{ nextauth: string[] }> };

function safeDecode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildLocation(req: Request): string | null {
  const city = req.headers.get("x-vercel-ip-city");
  const region = req.headers.get("x-vercel-ip-region");
  const country = req.headers.get("x-vercel-ip-country");

  if (!city && !country) return null;

  const decodedCity = safeDecode(city);
  const decodedRegion = safeDecode(region);
  const decodedCountry = safeDecode(country);

  const parts = [decodedCity, decodedRegion, decodedCountry].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function GET(
  req: Request,
  context: NextAuthContext
): Promise<Response> {
  return runWithNextAuthCookieHeaderAsync(req.headers.get("cookie") ?? "", () => {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const location = buildLocation(req);
    setPendingRequestMeta(ip, userAgent, location);
    setEventsRequestMeta(ip, userAgent);
    return handler(req, context);
  });
}

export function POST(
  req: Request,
  context: NextAuthContext
): Promise<Response> {
  return runWithNextAuthCookieHeaderAsync(req.headers.get("cookie") ?? "", () => {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const location = buildLocation(req);
    setPendingRequestMeta(ip, userAgent, location);
    setEventsRequestMeta(ip, userAgent);
    return handler(req, context);
  });
}
