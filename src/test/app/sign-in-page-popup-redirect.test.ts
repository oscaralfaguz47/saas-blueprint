import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  getServerSession: vi.fn(),
  cookies: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  checkAndUpdateSessionActivity: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    accountLinkIntent: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

vi.mock("@/server/services/inactivity", () => ({
  checkAndUpdateSessionActivity: mocks.checkAndUpdateSessionActivity,
}));

import SignInPage from "@/app/(auth)/auth/sign-in/page";

describe("sign-in page — Settings link email_mismatch redirects to popup-callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: () => undefined,
    });
    mocks.checkAndUpdateSessionActivity.mockResolvedValue({ status: "ok" as const });
  });

  it("redirects to popup-callback with error and provider when session + recent email_mismatch intent", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "user-1", sessionToken: undefined },
    });
    mocks.findFirst.mockResolvedValue({
      id: "intent-1",
      targetProvider: "azure-ad",
    });
    mocks.update.mockResolvedValue({});

    await expect(
      SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) })
    ).rejects.toThrow(
      "REDIRECT:/auth/popup-callback?error=link_email_mismatch&provider=azure-ad"
    );

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "intent-1" },
      data: { errorCode: null },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth/popup-callback?error=link_email_mismatch&provider=azure-ad"
    );
  });

  it("URL-encodes provider in popup-callback redirect", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "user-1", sessionToken: undefined },
    });
    mocks.findFirst.mockResolvedValue({
      id: "intent-2",
      targetProvider: "google&trick=1",
    });
    mocks.update.mockResolvedValue({});

    const expected =
      "/auth/popup-callback?error=link_email_mismatch&provider=" +
      encodeURIComponent("google&trick=1");

    await expect(
      SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) })
    ).rejects.toThrow(`REDIRECT:${expected}`);

    expect(mocks.redirect).toHaveBeenCalledWith(expected);
  });

  it("does not redirect to popup-callback when session + AccessDenied but no recent mismatch", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "user-1", sessionToken: undefined },
    });
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) })
    ).rejects.toThrow("REDIRECT:/app/requests");

    expect(mocks.redirect).toHaveBeenCalledWith("/app/requests");
    expect(mocks.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining("/auth/popup-callback")
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("unauthenticated AccessDenied still redirects to /api/link/pending", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(
      SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) })
    ).rejects.toThrow("REDIRECT:/api/link/pending");

    expect(mocks.redirect).toHaveBeenCalledWith("/api/link/pending");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
