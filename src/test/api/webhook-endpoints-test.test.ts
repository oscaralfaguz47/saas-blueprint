import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  webhookEndpointFindFirst: vi.fn(),
  webhookEndpointUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  webhookDeliveryCreate: vi.fn(),
  checkRateLimit: vi.fn(),
  decryptWebhookSecret: vi.fn(),
  deliverWebhook: vi.fn(),
  resolveTenantPlan: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/server/auth-options", () => ({ authOptions: {} }));
vi.mock("@/server/require-full-session", () => ({
  requireFullSession: mocks.requireFullSession,
}));
vi.mock("@/server/services/tenancy", () => ({
  getDefaultTenantForUser: mocks.getDefaultTenantForUser,
}));
vi.mock("@/server/security/tenant-authorization", () => ({
  hasTenantPermission: mocks.hasTenantPermission,
}));
vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    webhookEndpoint: {
      findFirst: mocks.webhookEndpointFindFirst,
      update: mocks.webhookEndpointUpdate,
    },
    tenant: { findUnique: mocks.tenantFindUnique },
    webhookDelivery: { create: mocks.webhookDeliveryCreate },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/server/webhooks/secret-encryption", () => ({
  decryptWebhookSecret: mocks.decryptWebhookSecret,
}));
vi.mock("@/server/webhooks/deliver", () => ({
  deliverWebhook: mocks.deliverWebhook,
}));
vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: mocks.resolveTenantPlan,
}));

import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { POST as POST_TEST } from "@/app/api/tenant/webhook-endpoints/[endpointId]/test/route";

const TENANT_ID = "cltenantwebhooks00001";
const ACTOR_ID = "clactorwebhooks000001";
const EP_ID = "clxxxxxxxxxxxxxxxxxxxxx9";
const baseSession = { user: { id: ACTOR_ID, sessionToken: "s" } };

function setupAuthed() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
}

function activeEndpoint(status: "ACTIVE" | "PAUSED" = "ACTIVE") {
  return {
    id: EP_ID,
    url: "https://example.com/webhook",
    secretEncrypted: "encrypted-secret",
    status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAuthed();
  mocks.webhookEndpointFindFirst.mockResolvedValue(activeEndpoint());
  mocks.tenantFindUnique.mockResolvedValue({
    id: TENANT_ID,
    slug: "tenant-slug",
    name: "Tenant Name",
  });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.decryptWebhookSecret.mockReturnValue("plain-secret");
  mocks.deliverWebhook.mockResolvedValue({
    status: "SUCCEEDED",
    httpStatus: 200,
    durationMs: 42,
  });
  mocks.webhookDeliveryCreate.mockResolvedValue({});
  mocks.resolveTenantPlan.mockResolvedValue({
    features: { webhooks: true },
  });
});

describe("POST /api/tenant/webhook-endpoints/[endpointId]/test", () => {
  it("401 when unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    mocks.requireFullSession.mockResolvedValue(null);
    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("404 when endpoint missing or cross-tenant (concealment)", async () => {
    mocks.webhookEndpointFindFirst.mockResolvedValue(null);
    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("403 UPGRADE_REQUIRED when plan blocks webhooks", async () => {
    mocks.resolveTenantPlan.mockResolvedValue({
      features: { webhooks: false },
    });
    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(isUpgradeRequiredFromApiResponse(json)).toBe(true);
  });

  it("429 when rate limited with retryAfter", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 44 });
    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("44");
    const json = (await res.json()) as { error?: { code?: string; details?: { retryAfterSeconds?: number } } };
    expect(json.error?.code).toBe("RATE_LIMITED");
    expect(json.error?.details?.retryAfterSeconds).toBe(44);
    expect(mocks.deliverWebhook).not.toHaveBeenCalled();
  });

  it("200 success: eventName, shared deliveryId, attemptCount 1, no endpoint update", async () => {
    let seenDeliveryId = "";
    mocks.deliverWebhook.mockImplementation(async (input: { deliveryId: string }) => {
      seenDeliveryId = input.deliveryId;
      return { status: "SUCCEEDED", httpStatus: 201, durationMs: 99 };
    });

    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { deliveryId: string; result: { status: string; httpStatus?: number } };
    };
    expect(json.data.deliveryId).toBe(seenDeliveryId);
    expect(json.data.result.status).toBe("SUCCEEDED");
    expect(json.data.result.httpStatus).toBe(201);

    expect(mocks.webhookDeliveryCreate).toHaveBeenCalledTimes(1);
    const createArg = mocks.webhookDeliveryCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data.eventName).toBe("webhook.test");
    expect(createArg.data.id).toBe(seenDeliveryId);
    expect(createArg.data.attemptCount).toBe(1);
    expect(createArg.data.status).toBe("SUCCEEDED");
    expect(mocks.webhookEndpointUpdate).not.toHaveBeenCalled();
  });

  it("200 maps FAILED_RETRY from deliver to FAILED_FINAL in DB and response", async () => {
    mocks.deliverWebhook.mockResolvedValue({
      status: "FAILED_RETRY",
      httpStatus: 503,
      durationMs: 7,
      errorMessage: "HTTP 503",
    });

    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { result: { status: string; errorMessage?: string | null } };
    };
    expect(json.data.result.status).toBe("FAILED_FINAL");

    const createArg = mocks.webhookDeliveryCreate.mock.calls[0]![0] as {
      data: { status: string };
    };
    expect(createArg.data.status).toBe("FAILED_FINAL");
  });

  it("does not call webhookEndpoint.update (health fields untouched)", async () => {
    await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(mocks.webhookEndpointUpdate).not.toHaveBeenCalled();
  });

  it("400 when endpointId is not a valid cuid", async () => {
    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: "not-a-cuid" }),
    });
    expect(res.status).toBe(400);
    expect(mocks.webhookEndpointFindFirst).not.toHaveBeenCalled();
  });

  it("400 when endpoint exists but is not ACTIVE", async () => {
    mocks.webhookEndpointFindFirst.mockResolvedValue(activeEndpoint("PAUSED"));
    const res = await POST_TEST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toMatch(/not active/i);
  });
});
