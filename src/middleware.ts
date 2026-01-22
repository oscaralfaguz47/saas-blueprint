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

  // External public approval pages
  if (pathname.startsWith("/r/")) return true;

  return false;
}

/** Protected product/app areas */
function isProtectedPath(pathname: string) {
  return pathname.startsWith("/app") || pathname.startsWith("/admin");
}

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin");
}

function normalizePlatformAllowlist() {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Public routes: pass-through (+ hardening for /r/)
  if (isPublicPath(pathname)) {
    if (pathname.startsWith("/r/")) {
      const res = NextResponse.next();
      res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return res;
    }
    return NextResponse.next();
  }

  // 2) Anything not under /app or /admin stays public
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // 3) Protected routes require auth
  const token = await getToken({ req });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    // Preserve full path + query as callbackUrl
    url.searchParams.set("callbackUrl", req.nextUrl.href);
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
