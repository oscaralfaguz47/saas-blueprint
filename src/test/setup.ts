import { vi } from "vitest";

// Mock server-only so it does not throw in test environment
vi.mock("server-only", () => ({}));

// Mock next/server to avoid Next.js runtime dependencies in unit tests
vi.mock("next/server", () => {
  return {
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const headers = new Headers(init?.headers as HeadersInit | undefined);
        return {
          status: init?.status ?? 200,
          headers,
          json: async () => body,
          cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
        };
      },
    },
  };
});
