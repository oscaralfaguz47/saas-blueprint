import type { NextConfig } from "next";

// Content-Security-Policy is set dynamically in middleware.ts with a per-request nonce
// to enable nonce-based script allowlisting (no unsafe-inline / no unsafe-eval in production).
// See middleware.ts buildCsp() for the current policy.

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/app/help", destination: "/app/help/inbox", permanent: false },
      { source: "/app/help/", destination: "/app/help/inbox", permanent: false },
      { source: "/app/help/search", destination: "/app/help/inbox", permanent: false },
      { source: "/app/help/search/", destination: "/app/help/inbox", permanent: false },
      { source: "/help/search", destination: "/help", permanent: false },
      { source: "/help/search/", destination: "/help", permanent: false },
    ];
  },
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
