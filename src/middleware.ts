import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type Role = "ADMIN" | "MANAGER" | "MEMBER";

export default withAuth(
  async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Always allow NextAuth routes
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    // Read token from NextAuth (JWT)
    const token = (await getToken({ req })) as { role?: Role } | null;
    const role = token?.role;

    // Authorization: Admin
    if (pathname.startsWith("/dashboard/admin")) {
      if (role !== "ADMIN") {
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // Authorization: Manager (ADMIN or MANAGER)
    if (pathname.startsWith("/dashboard/manager")) {
      if (role !== "ADMIN" && role !== "MANAGER") {
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // Member: any authenticated user
    return NextResponse.next();
  },
  {
    callbacks: {
      // Auth gating:
      // - /api/auth always allowed
      // - /unauthorized allowed (so redirect works)
      // - /dashboard requires session token
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        if (pathname.startsWith("/api/auth")) return true;
        if (pathname.startsWith("/unauthorized")) return true;

        // Protect dashboard
        if (pathname.startsWith("/dashboard")) return !!token;

        // If matcher includes other routes later, keep them open by default
        return true;
      },
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/unauthorized"],
};
