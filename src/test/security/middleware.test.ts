import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    headers: Headers;
    redirectedTo?: string;

    constructor(_body?: unknown, init?: ResponseInit) {
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
    }

    static next(): MockNextResponse {
      return new MockNextResponse(null, { status: 200 });
    }

    static redirect(url: URL | string): MockNextResponse {
      const res = new MockNextResponse(null, { status: 307 });
      res.redirectedTo = typeof url === "string" ? url : url.toString();
      return res;
    }
  }

  return { NextResponse: MockNextResponse };
});

import { middleware } from "../../../middleware";

function buildRequest(path: string, opts?: { method?: string }) {
  const url = `https://example.com${path}`;
  const nextUrl = new URL(url) as URL & { clone: () => URL };
  nextUrl.clone = () => new URL(nextUrl.toString());
  return {
    method: opts?.method ?? "GET",
    url,
    headers: new Headers(),
    nextUrl,
  };
}

describe("middleware admin gating behavior", () => {
  beforeEach(() => {
    mocks.getToken.mockReset();
  });

  it("passes through authenticated /admin path without unauthorized redirect", async () => {
    mocks.getToken.mockResolvedValue({ email: "user@example.com" });

    const res = await middleware(buildRequest("/admin/workspaces") as never);

    expect(res.status).toBe(200);
    expect((res as { redirectedTo?: string }).redirectedTo).toBeUndefined();
  });

  it("passes through authenticated /api/admin path without unauthorized redirect", async () => {
    mocks.getToken.mockResolvedValue({ email: "user@example.com" });

    const res = await middleware(buildRequest("/api/admin/vendor-users") as never);

    expect(res.status).toBe(200);
    expect((res as { redirectedTo?: string }).redirectedTo).toBeUndefined();
  });

  it("redirects unauthenticated /admin path to sign-in with callback", async () => {
    mocks.getToken.mockResolvedValue(null);

    const res = await middleware(buildRequest("/admin/workspaces") as never);
    const redirectedTo = (res as { redirectedTo?: string }).redirectedTo;

    expect(redirectedTo).toContain("/auth/sign-in");
    expect(redirectedTo).toContain("callbackUrl=%2Fadmin%2Fworkspaces");
  });

  it("keeps public routes as pass-through", async () => {
    const resRoot = await middleware(buildRequest("/") as never);
    const resPricing = await middleware(buildRequest("/pricing") as never);
    const resHelp = await middleware(buildRequest("/help") as never);

    expect(resRoot.status).toBe(200);
    expect(resPricing.status).toBe(200);
    expect(resHelp.status).toBe(200);
  });
});
