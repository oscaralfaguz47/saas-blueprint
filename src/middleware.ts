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
  // Protect app UI
  if (pathname.startsWith("/app") || pathname.startsWith("/admin")) return true;

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

  // de-dupe
  return Array.from(new Set(list));
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

  // 2) Anything not protected stays public
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // 3) Protected routes require auth
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in";

    // Preserve only path + query (same-origin safe)
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
