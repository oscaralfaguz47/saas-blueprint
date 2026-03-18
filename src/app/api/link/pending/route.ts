import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getLinkChallengeCookieName } from "@/server/lib/cookie-names";

// GET /api/link/pending
//
// Called by the sign-in page server component when it detects
// ?error=AccessDenied. Determines whether this is a genuine access denial
// or a link challenge redirect:
//
// - If a fresh pending AuthLinkChallenge exists in DB (pendingRawToken set,
//   cookieIssuedAt null, created within the last 60 seconds):
//   → clears pendingRawToken, sets cookieIssuedAt, sets HttpOnly cookie,
//     redirects to /auth/link-account?challenge=<token>
//
// - If no pending challenge exists:
//   → redirects to /auth/sign-in?error=AccessDenied (genuine denial)
//
// This endpoint has no authentication requirement because it is called
// immediately after a failed sign-in (user has no session). Security comes
// from the challenge being short-lived, one-time, and email-scoped.
export async function GET(req: Request) {
  const { origin } = new URL(req.url);

  try {
    const challenge = await prisma.authLinkChallenge.findFirst({
      where: {
        consumedAt: null,
        cookieIssuedAt: null,
        pendingRawToken: { not: null },
        // Must be fresh — created within the last 60 seconds.
        // Prevents stale challenges from being accidentally picked up.
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, pendingRawToken: true },
    });

    if (!challenge?.pendingRawToken) {
      // No pending challenge — this is a genuine AccessDenied.
      return NextResponse.redirect(
        new URL("/auth/sign-in?error=AccessDenied", origin)
      );
    }

    const rawToken = challenge.pendingRawToken;

    // Clear the raw token and record when the cookie was issued — atomic.
    await prisma.authLinkChallenge.update({
      where: { id: challenge.id },
      data: {
        pendingRawToken: null,
        cookieIssuedAt: new Date(),
      },
    });

    const redirectUrl = new URL("/auth/link-account", origin);
    redirectUrl.searchParams.set("challenge", rawToken);

    const cookieName = getLinkChallengeCookieName();
    const isProduction = process.env.NODE_ENV === "production";
    const cookieHeader = [
      `${cookieName}=${encodeURIComponent(rawToken)}`,
      "Path=/auth",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=900",
      ...(isProduction ? ["Secure"] : []),
    ].join("; ");

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        "Set-Cookie": cookieHeader,
      },
    });
  } catch {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=Default", origin)
    );
  }
}
