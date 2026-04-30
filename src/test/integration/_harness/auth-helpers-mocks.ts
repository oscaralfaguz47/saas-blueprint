/**
 * Must be the first import in each `*.integration.test.ts` so `vi.mock` runs before
 * any `@/server` or `@/app` module is evaluated.
 */
import type { Session } from "next-auth";
import { vi } from "vitest";

const authMockState = vi.hoisted(() => ({
  session: null as Session | null,
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => authMockState.session,
}));

vi.mock("@/server/require-full-session", () => ({
  requireFullSession: async () => null,
}));

vi.mock("@/server/auth-options", () => ({
  authOptions: {},
}));

vi.mock("@/server/services/invitation-email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

export function setMockSession(session: Session | null): void {
  authMockState.session = session;
}

export function mockAppSession(
  userId: string,
  overrides: Partial<NonNullable<Session["user"]>> = {}
): Session {
  return {
    user: {
      id: userId,
      email: "session@test.local",
      name: "Session User",
      authLevel: "FULL",
      mfaVerified: true,
      totpEnabled: false,
      sessionToken: "tok_integration",
      ...overrides,
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}
