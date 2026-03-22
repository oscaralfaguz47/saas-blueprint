import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { env } from "@/lib/env";

/** Cryptographic nonce for CSP (Edge-safe; no Node Buffer). */
function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Mirrors R2 origin logic previously in next.config.ts (same as env-based derivation). */
function getR2OriginForCsp(): string {
  const explicit = env.NEXT_PUBLIC_R2_BUCKET_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const bucket = env.R2_BUCKET_NAME?.trim();
  if (accountId && bucket)
    return `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;
  return "";
}

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const r2Origin = getR2OriginForCsp();

  const connectSrc = [
    "'self'",
    "https://*.paddle.com",
    "https://*.vercel.app",
    "https://*.ngrok-free.app",
    "https://*.ngrok-free.dev",
    "wss://*.ngrok-free.app",
    "wss://*.ngrok-free.dev",
    "https://accounts.google.com",
    "https://login.microsoftonline.com",
    "https://github.com",
    ...(r2Origin ? [r2Origin] : []),
  ].join(" ");

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://lh3.googleusercontent.com",
    "https://avatars.githubusercontent.com",
    ...(r2Origin ? [r2Origin] : []),
  ].join(" ");

  const scriptSrcParts = [
    "'self'",
    `'nonce-${nonce}'`,
    "'wasm-unsafe-eval'",
    "https://*.paddle.com",
  ];
  if (!isProd) {
    scriptSrcParts.push("'unsafe-eval'");
  }
  const scriptSrc = scriptSrcParts.join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://*.paddle.com",
    `img-src ${imgSrc}`,
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-src 'self' https://*.paddle.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function nextWithNonce(
  req: NextRequest,
  nonce: string,
  configure?: (res: NextResponse) => void
): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  res.headers.set("x-nonce", nonce);
  configure?.(res);
  return res;
}

function redirectWithCsp(req: NextRequest, url: URL, nonce: string): NextResponse {
  const res = NextResponse.redirect(url);
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  return res;
}

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

  // Email OTP (public, no authenticated session required)
  if (pathname.startsWith("/api/auth/email-otp/")) return true;

  // NextAuth endpoints must be public
  if (pathname.startsWith("/api/auth")) return true;

  // Passkey authenticate (user not logged in when signing in with passkey)
  if (pathname.startsWith("/api/auth/passkey/authenticate/")) return true;

  // Link challenge endpoints must be public — they are called during the
  // unauthenticated link flow and must never be redirected to sign-in,
  // which would corrupt the OAuth callbackUrl and break the state cookie.
  if (pathname.startsWith("/api/link/")) return true;

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
  const single = (env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const raw = env.PLATFORM_ADMIN_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (single) list.push(single);

  return Array.from(new Set(list));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const nonce = generateCspNonce();

  // Extra hardening: always allow Next internal paths and static assets (never intercept auth)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".map") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2")
  ) {
    return nextWithNonce(req, nonce);
  }

  // Handle CORS preflight requests for API routes
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin") ?? "";
    const allowedOrigins = [
      env.NEXTAUTH_URL ?? "",
      env.NEXTAUTH_URL_INTERNAL ?? "",
      "https://saas-blueprint-three.vercel.app",
    ].filter(Boolean);

    const isAllowedOrigin =
      origin.includes("localhost") ||
      origin.includes("ngrok-free.app") ||
      origin.includes("ngrok-free.dev") ||
      allowedOrigins.some((allowed) => origin === allowed);

    const res = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin) {
      res.headers.set("Access-Control-Allow-Origin", origin);
    }
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.headers.set("Access-Control-Max-Age", "86400");
    res.headers.set("Vary", "Origin");
    res.headers.set("Content-Security-Policy", buildCsp(nonce));
    return res;
  }

  // Cron endpoints are invoked by Vercel Cron (or tools like Postman) with Authorization: Bearer CRON_SECRET.
  // They must bypass session auth here so the route handler can return JSON (401/200); auth is enforced inside the route.
  if (pathname === "/api/internal/cron" || pathname.startsWith("/api/internal/cron/")) {
    return nextWithNonce(req, nonce);
  }

  // 1) Public routes: pass-through (+ hardening for /r/)
  if (isPublicPath(pathname)) {
    if (pathname.startsWith("/r/")) {
      return nextWithNonce(req, nonce, (res) => {
        res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      });
    }
    // Clear MFA cookie so a previous user's verification cannot allow another user to skip 2FA:
    // - on sign-in/sign-out pages (when user visits those URLs)
    // - on NextAuth callback (when user completes magic link or OAuth — they may never hit /auth/sign-in)
    const shouldClearMfaCookie =
      pathname === "/auth/sign-in" ||
      pathname === "/auth/sign-out" ||
      pathname.startsWith("/api/auth/callback/");
    if (shouldClearMfaCookie) {
      return nextWithNonce(req, nonce, (res) => {
        res.cookies.set("mfa_just_verified", "", {
          maxAge: 0,
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
      });
    }
    return nextWithNonce(req, nonce);
  }

  // 2) Anything not protected stays public
  if (!isProtectedPath(pathname)) {
    return nextWithNonce(req, nonce);
  }

  // 3) Protected routes require auth
  const secret = env.NEXTAUTH_SECRET;

  // Fail-safe: if secret is missing, do NOT attempt getToken (can throw/hang in dev misconfig)
  // In production you SHOULD enforce it, but this avoids "app never loads" in dev misconfig.
  if (!secret) {
    const res = redirectWithCsp(req, new URL("/auth/sign-in", req.url), nonce);
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

    return redirectWithCsp(req, url, nonce);
  }

  // 4) Admin area allowlist gating by email
  if (isAdminPath(pathname)) {
    const allowlist = normalizePlatformAllowlist();
    const email = (token.email as string | undefined)?.toLowerCase();
    const isAllowed = !!email && allowlist.includes(email);

    if (!isAllowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return redirectWithCsp(req, url, nonce);
    }
  }

  return nextWithNonce(req, nonce, (res) => {
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|map)$).*)",
  ],
};
