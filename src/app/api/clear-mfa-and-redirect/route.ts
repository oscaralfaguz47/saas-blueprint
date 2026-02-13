import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/clear-mfa-and-redirect?to=/auth/2fa
 * Clears the mfa_just_verified cookie (so a previous user's verification cannot
 * allow another user to skip 2FA) and redirects to the given URL.
 * Used from app layout when we detect: user has 2FA enabled, session is not
 * MFA-verified, but the cookie is set (stale from another user).
 */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") ?? "/auth/2fa";
  const path = to.startsWith("/") ? to : `/${to}`;

  const res = NextResponse.redirect(new URL(path, req.url));
  res.cookies.set("mfa_just_verified", "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
