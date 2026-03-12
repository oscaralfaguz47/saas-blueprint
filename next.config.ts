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
// Paddle.js (cdn.paddle.com) is required for the billing checkout flow.
// Paddle checkout overlays use iframes on *.paddle.com subdomains.
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
  "https://*.paddle.com",       // Paddle checkout & API calls
  ...(r2Origin ? [r2Origin] : []),
].join(" ");

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https://lh3.googleusercontent.com",  // Google OAuth profile photos
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.paddle.com",
      "style-src 'self' 'unsafe-inline' https://*.paddle.com",
      `img-src ${imgSrc}`,
      "font-src 'self'",
      `connect-src ${connectSrc}`,
      "frame-src 'self' https://*.paddle.com",  // Paddle checkout overlay iframes
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

