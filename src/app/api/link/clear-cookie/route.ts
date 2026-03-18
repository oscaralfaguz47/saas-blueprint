import "server-only";
import { NextResponse } from "next/server";
import { getLinkChallengeCookieName } from "@/server/lib/cookie-names";

/**
 * GET /api/link/clear-cookie?redirect=/auth/sign-in
 *
 * Clears the link-challenge cookie and redirects to the given path.
 * Used so that after logout or "Back to sign in" from the link-account page,
 * the user lands on the sign-in page without the cookie, avoiding a redirect
 * loop back to /auth/link-account?challenge=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawRedirect = searchParams.get("redirect")?.trim();
  const redirectPath =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/auth/sign-in";

  const cookieName = getLinkChallengeCookieName();
  const isProduction = process.env.NODE_ENV === "production";
  const clearCookieHeader = [
    `${cookieName}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0`,
    ...(isProduction ? ["Secure"] : []),
  ].join("; ");

  return NextResponse.redirect(new URL(redirectPath, req.url), {
    status: 302,
    headers: { "Set-Cookie": clearCookieHeader },
  });
}
