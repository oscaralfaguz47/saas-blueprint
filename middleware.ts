import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Public routes (no auth required)
 * Note: Route Groups like (public) do NOT exist in the URL, so we match real paths only.
 */
function isPublicPath(pathname: string) {
  if (pathname === "/") return true;

  // Marketing / legal
  if (pathname.startsWith("/pricing")) return true;
  if (pathname.startsWith("/privacy")) return true;
  if (pathname.startsWith("/terms")) return true;

  // Auth UI routes
  if (pathname.startsWith("/auth")) return true;

  // Unauthorized page
  if (pathname.startsWith("/unauthorized")) return true;

  // NextAuth endpoints must be public
  if (pathname.startsWith("/api/auth")) return true;

  // Health check for load balancers and monitoring (no auth)
  if (pathname === "/api/health") return true;

  // Paddle webhook: no session; verified by Paddle-Signature in the route handler
  if (pathname === "/api/billing/paddle/webhook") return true;

  // External public approval pages
  if (pathname.startsWith("/r/")) return true;

  return false;
}

/** Protected product/app areas */
function isProtectedPath(pathname: string) {
  // Protect app UI
  if (pathname.startsWith("/app") || pathname.startsWith("/admin")) return true;

  // A5: setup (claim/choose) requires auth
  if (pathname.startsWith("/setup")) return true;

  // A5: invitations management requires auth
  if (pathname.startsWith("/invitations")) return true;

  // Protect APIs by default (except NextAuth)
  if (pathname.startsWith("/api") && !pathname.startsWith("/api/auth")) return true;

  return false;
}

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin");
}

function normalizePlatformAllowlist() {
  const single = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (single) list.push(single);

  return Array.from(new Set(list));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Extra hardening: always allow Next internal paths
  if (pathname.startsWith("/_next")) return NextResponse.next();

  // Cron endpoints are invoked by Vercel Cron (or tools like Postman) with Authorization: Bearer CRON_SECRET.
  // They must bypass session auth here so the route handler can return JSON (401/200); auth is enforced inside the route.
  if (pathname === "/api/internal/cron" || pathname.startsWith("/api/internal/cron/")) {
    return NextResponse.next();
  }

  // 1) Public routes: pass-through (+ hardening for /r/)
  if (isPublicPath(pathname)) {
    if (pathname.startsWith("/r/")) {
      const res = NextResponse.next();
      res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return res;
    }
    // Clear MFA cookie so a previous user's verification cannot allow another user to skip 2FA:
    // - on sign-in/sign-out pages (when user visits those URLs)
    // - on NextAuth callback (when user completes magic link or OAuth — they may never hit /auth/sign-in)
    const shouldClearMfaCookie =
      pathname === "/auth/sign-in" ||
      pathname === "/auth/sign-out" ||
      pathname.startsWith("/api/auth/callback/");
    if (shouldClearMfaCookie) {
      const res = NextResponse.next();
      res.cookies.set("mfa_just_verified", "", {
        maxAge: 0,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
      return res;
    }
    return NextResponse.next();
  }

  // 2) Anything not protected stays public
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // 3) Protected routes require auth
  const secret = process.env.NEXTAUTH_SECRET;

  // Fail-safe: if secret is missing, do NOT attempt getToken (can throw/hang in edge)
  // In production you SHOULD enforce it, but this avoids "app never loads" in dev misconfig.
  if (!secret) {
    const res = NextResponse.redirect(new URL("/auth/sign-in", req.url));
    res.headers.set("X-Auth-Error", "Missing NEXTAUTH_SECRET");
    return res;
  }

  let token: Awaited<ReturnType<typeof getToken>> | null = null;

  try {
    token = await getToken({ req, secret });
  } catch {
    // If token parsing fails, treat as unauthenticated (avoid freezing the request)
    token = null;
  }

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in";

    const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
    url.searchParams.set("callbackUrl", callbackUrl);

    return NextResponse.redirect(url);
  }

  // 4) Admin area allowlist gating by email
  if (isAdminPath(pathname)) {
    const allowlist = normalizePlatformAllowlist();
    const email = (token.email as string | undefined)?.toLowerCase();
    const isAllowed = !!email && allowlist.includes(email);

    if (!isAllowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|map)$).*)",
  ],
};
