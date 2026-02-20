import { NextResponse } from "next/server";

/**
 * GET /api/billing/paddle/checkout-config
 *
 * Returns minimal Paddle checkout config status for troubleshooting
 * (e.g. "Failed to retrieve JWT"). No auth required. Does not expose secrets.
 */
export async function GET() {
  const raw =
    typeof process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN === "string"
      ? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
      : "";
  const token = raw.trim();
  const clientTokenSet = token.length > 0;
  const environment =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? "production"
      : process.env.PADDLE_ENVIRONMENT === "sandbox"
        ? "sandbox"
        : null;
  const tokenPrefix = token.startsWith("test_")
    ? "test_"
    : token.startsWith("live_")
      ? "live_"
      : null;

  return NextResponse.json({
    clientTokenSet,
    tokenPrefix,
    environment,
    hint: !clientTokenSet
      ? "Set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN in your deployment env and redeploy."
      : tokenPrefix === null
        ? "Client token should start with test_ (sandbox) or live_ (production)."
        : null,
  });
}
