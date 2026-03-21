import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Environment-aware CSP: allow the exact R2 bucket endpoint when configured.
//
// Priority for the R2 origin:
//   1. NEXT_PUBLIC_R2_BUCKET_URL  (explicit override, full origin)
//   2. R2_ACCOUNT_ID + R2_BUCKET_NAME (derives virtual-hosted-style origin)
//
// Google profile images (lh3.googleusercontent.com) are always allowed because
// the app renders OAuth profile photos from Google accounts.
//
// GitHub avatars (avatars.githubusercontent.com) are allowed for OAuth profile images.
//
// Paddle.js (cdn.paddle.com / sandbox-cdn.paddle.com) is required for billing.
// Paddle checkout overlays use iframes on *.paddle.com subdomains.
//
// connect-src includes OAuth issuer origins, Vercel preview URLs, ngrok (HTTP + WSS for HMR),
// and wasm-friendly script allowances via script-src (WebAuthn / passkeys).
// ---------------------------------------------------------------------------
const r2Origin = (() => {
  const explicit = process.env.NEXT_PUBLIC_R2_BUCKET_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (accountId && bucket)
    return `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;
  return "";
})();

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

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://*.paddle.com",
      "style-src 'self' 'unsafe-inline' https://*.paddle.com",
      `img-src ${imgSrc}`,
      "font-src 'self'",
      `connect-src ${connectSrc}`,
      "frame-src 'self' https://*.paddle.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/static/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Vary", value: "Origin, Accept-Encoding" },
        ],
      },
      {
        // Apply COOP only to authenticated app routes — never to auth pages
        // Auth pages (sign-in, popup-callback) need window.opener access for OAuth popup flow
        source: "/app/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
