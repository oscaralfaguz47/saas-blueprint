import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/server/auth-options", () => ({
  authOptions: {},
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    accountLinkIntent: {
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
      create: mocks.create,
    },
  },
}));

import { POST } from "@/app/api/account/link-provider/initiate/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/account/link-provider/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/link-provider/initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u1", authLevel: "FULL" },
    });
    mocks.userFindUnique.mockResolvedValue({ email: "user@example.com" });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    mocks.create.mockResolvedValue({});
  });

  it("returns apiSuccess envelope for google", async () => {
    const res = await POST(buildRequest({ provider: "google" }));
    const body = (await res.json()) as { data?: { token?: string } };

    expect(res.status).toBe(200);
    expect(typeof body.data?.token).toBe("string");
    expect((body.data?.token ?? "").length).toBeGreaterThan(0);
  });

  it("returns apiSuccess envelope for azure-ad", async () => {
    const res = await POST(buildRequest({ provider: "azure-ad" }));
    const body = (await res.json()) as { data?: { token?: string } };

    expect(res.status).toBe(200);
    expect(typeof body.data?.token).toBe("string");
    expect((body.data?.token ?? "").length).toBeGreaterThan(0);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    const res = await POST(buildRequest({ provider: "google" }));
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("rejects non-FULL auth level", async () => {
    mocks.getServerSession.mockResolvedValueOnce({
      user: { id: "u1", authLevel: "PENDING_MFA" },
    });

    const res = await POST(buildRequest({ provider: "google" }));
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("rejects invalid provider payload", async () => {
    const res = await POST(buildRequest({ provider: "github" }));
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects when user email is missing", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ email: null });

    const res = await POST(buildRequest({ provider: "google" }));
    const body = (await res.json()) as { error?: { code?: string; message?: string } };

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.message).toBe("User email not found");
  });
});
