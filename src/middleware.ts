import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";


function isPublicPath(pathname: string) {
  // Marketing + auth pages should remain public (auth pages handle logged-in redirects)
  if (pathname === "/") return true;
  if (pathname.startsWith("/pricing")) return true;
  if (pathname.startsWith("/privacy")) return true;
  if (pathname.startsWith("/terms")) return true;

  if (pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/signin")) return true; // legacy alias (optional)
  if (pathname.startsWith("/unauthorized")) return true;

  // NextAuth routes must be public
  if (pathname.startsWith("/api/auth")) return true;

  // External approval pages must be public
  if (pathname.startsWith("/r/")) return true;

  return false;
}

function isAppPath(pathname: string) {
  return pathname.startsWith("/app");
}

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin");
}
function isDashboardPath(pathname: string) {
  return pathname.startsWith("/dashboard");
}

function normalizePlatformAllowlist() {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default withAuth(
  async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Legacy: redirect old dashboard routes to /app
if (isDashboardPath(pathname)) {
  const url = req.nextUrl.clone();
  url.pathname = "/app";
  return NextResponse.redirect(url);
}

    // Public paths pass through
    if (isPublicPath(pathname)) {
      // Hardening for external pages (no-index)
      if (pathname.startsWith("/r/")) {
        const res = NextResponse.next();
        res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        return res;
      }
      return NextResponse.next();
    }

    // At this point: protected paths only.
const token = await getToken({ req });


    // Safety: if token is missing, NextAuth authorized() should have redirected,
    // but we keep a belt-and-suspenders redirect.
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/sign-in";
      return NextResponse.redirect(url);
    }

    // PLATFORM ADMIN gating (allowlist by email)
    if (isAdminPath(pathname)) {
      const allowlist = normalizePlatformAllowlist();

     const email = (token?.email as string | undefined)?.toLowerCase();
      const isAllowed = !!email && allowlist.includes(email);

      if (!isAllowed) {
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }

      return NextResponse.next();
    }

    // /app/* is authenticated. Tenant role checks should happen inside
    // server-side loaders/actions based on selected tenant/workspace context.
 if (isAppPath(pathname)) {
  return NextResponse.next();
}

    // Default: allow (or redirect if you prefer)
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Public paths do not require auth
        if (isPublicPath(pathname)) return true;

        // Everything else requires auth
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
      Apply middleware to everything except:
      - Next.js internals
      - static assets
    */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|map)$).*)",
  ],
};
