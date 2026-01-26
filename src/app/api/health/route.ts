import { NextResponse } from "next/server";

/**
 * Health check endpoint for Vercel deployments
 * Used for monitoring and deployment verification
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "unknown",
    },
    { status: 200 }
  );
}
