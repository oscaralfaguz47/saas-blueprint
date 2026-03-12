import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Environment-aware CSP: allow the exact R2 bucket endpoint when configured.
//
// Priority for the R2 origin:
//   1. NEXT_PUBLIC_R2_BUCKET_URL  (explicit override, full origin)
//   2. R2_ACCOUNT_ID              (derives https://<id>.r2.cloudflarestorage.com)
//
// Google profile images (lh3.googleusercontent.com) are always allowed because
// the app renders OAuth profile photos from Google accounts.
// ---------------------------------------------------------------------------
const r2Origin = (() => {
  // 1. Explicit override takes priority
  const explicit = process.env.NEXT_PUBLIC_R2_BUCKET_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  // 2. Derive from env vars — AWS SDK v3 uses virtual-hosted-style:
  //    https://<bucket>.<accountId>.r2.cloudflarestorage.com
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (accountId && bucket)
    return `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;
  return "";
})();

const connectSrc = r2Origin
  ? `'self' ${r2Origin}`
  : "'self'";

const imgSrc = r2Origin
  ? `'self' data: blob: https://lh3.googleusercontent.com ${r2Origin}`
  : "'self' data: blob: https://lh3.googleusercontent.com";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS: production only with HTTPS (Vercel complies)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // CSP: restrictive default; allows self + inline styles for Next.js hydration
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src ${imgSrc}`,
      "font-src 'self'",
      `connect-src ${connectSrc}`,
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

