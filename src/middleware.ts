import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type Role = "ADMIN" | "MANAGER" | "MEMBER";

export default withAuth(
  async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Permitir siempre NextAuth routes
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    // Leer token (JWT) de NextAuth sin usar "any"
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

    // Authorization: Manager (ADMIN o MANAGER)
    if (pathname.startsWith("/dashboard/manager")) {
      if (role !== "ADMIN" && role !== "MANAGER") {
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // Member: cualquiera autenticado
    return NextResponse.next();
  },
  {
    callbacks: {
      // Auth only: si no hay token, a /signin
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        if (pathname.startsWith("/api/auth")) return true;
        if (pathname.startsWith("/unauthorized")) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/unauthorized"],
};
