import { vi } from "vitest";

/**
 * Route handlers and server modules depend on these shims. Business logic, DB, and
 * selective auth still run in integration tests; only Next.js packaging is stubbed.
 */
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => {
  return {
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const headers = new Headers(init?.headers as HeadersInit | undefined);
        return {
          status: init?.status ?? 200,
          headers,
          json: async () => body,
        };
      },
    },
  };
});
