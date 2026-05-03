import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  webhookEndpointCount: vi.fn(),
  webhookEndpointFindMany: vi.fn(),
  webhookEndpointFindFirst: vi.fn(),
  webhookEndpointCreate: vi.fn(),
  webhookEndpointUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  $transaction: vi.fn(),
  resolveTenantPlan: vi.fn(),
  validateWebhookUrl: vi.fn(),
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
vi.mock("@/server/billing/resolve-tenant-plan", () => ({
  resolveTenantPlan: mocks.resolveTenantPlan,
}));
vi.mock("@/server/webhooks/url-validation", () => ({
  validateWebhookUrl: mocks.validateWebhookUrl,
}));
vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    webhookEndpoint: {
      count: mocks.webhookEndpointCount,
      findMany: mocks.webhookEndpointFindMany,
      findFirst: mocks.webhookEndpointFindFirst,
      create: mocks.webhookEndpointCreate,
      update: mocks.webhookEndpointUpdate,
    },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: mocks.$transaction,
  },
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/tenant/webhook-endpoints/route";
import { GET as GET_DETAIL } from "@/app/api/tenant/webhook-endpoints/[endpointId]/route";

const TENANT_ID = "cltenantwebhooks00001";
const ACTOR_ID = "clactorwebhooks000001";
const EP_ID = "clxxxxxxxxxxxxxxxxxxxxx9";
const baseSession = { user: { id: ACTOR_ID, sessionToken: "s" } };
const publicRow = {
  id: EP_ID,
  name: "Payments hook",
  description: null as string | null,
  url: "https://public.example.com/hook",
  subscribedEvents: ["record.created"] as const,
  secretHint: "a1b2",
  status: "ACTIVE" as const,
  consecutiveFailures: 0,
  lastSuccessAt: null as Date | null,
  lastFailureAt: null as Date | null,
  disabledAutoAt: null as Date | null,
  disabledAutoReason: null as string | null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  deletedAt: null as Date | null,
};

function setupAuthed() {
  mocks.getServerSession.mockResolvedValue(baseSession);
  mocks.requireFullSession.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
  mocks.getDefaultTenantForUser.mockResolvedValue({
    tenant: { id: TENANT_ID, name: "T", slug: "t" },
  });
  mocks.hasTenantPermission.mockResolvedValue(true);
  mocks.resolveTenantPlan.mockResolvedValue({ features: { webhooks: true } });
  mocks.validateWebhookUrl.mockResolvedValue({ ok: true as const });
}

function txMock() {
  mocks.$transaction.mockImplementation(
    async (fn: (tx: { webhookEndpoint: object; auditLog: object }) => Promise<unknown>) =>
      fn({
        webhookEndpoint: {
          create: mocks.webhookEndpointCreate,
          update: mocks.webhookEndpointUpdate,
        },
        auditLog: { create: mocks.auditLogCreate },
      })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock();
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.webhookEndpointCount.mockResolvedValue(0);
  mocks.webhookEndpointFindMany.mockResolvedValue([]);
  mocks.webhookEndpointFindFirst.mockResolvedValue(null);
  mocks.webhookEndpointCreate.mockResolvedValue(publicRow);
  mocks.webhookEndpointUpdate.mockResolvedValue(publicRow);
});

const createBody = () =>
  JSON.stringify({
    name: "H",
    url: "https://public.example.com/hook",
    subscribedEvents: ["record.created"],
  });

describe("POST /api/tenant/webhook-endpoints", () => {
  it("201 returns endpoint and whsec_ secret; audit has no secret fields", async () => {
    setupAuthed();
    const res = await POST_CREATE(
      new Request("http://localhost/api/tenant/webhook-endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: createBody(),
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { secret: string; endpoint: { url: string } } };
    expect(json.data.secret.startsWith("whsec_")).toBe(true);
    expect(json.data.endpoint.url).toBe(publicRow.url);
    expect(mocks.auditLogCreate).toHaveBeenCalled();
    const meta = mocks.auditLogCreate.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("secret");
    expect(meta).not.toHaveProperty("secretHash");
    expect(meta).not.toHaveProperty("secretHint");
    expect(meta).toEqual(
      expect.objectContaining({
        name: publicRow.name,
        url: "https://public.example.com/hook",
        subscribedEvents: ["record.created"],
        status: "ACTIVE",
      })
    );
  });

  it("403 UPGRADE_REQUIRED when plan has no webhooks", async () => {
    setupAuthed();
    mocks.resolveTenantPlan.mockResolvedValue({ features: { webhooks: false } });
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: createBody(),
      })
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; details?: { code?: string } } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.details?.code).toBe("UPGRADE_REQUIRED");
  });

  it("409 when max endpoints reached", async () => {
    setupAuthed();
    mocks.webhookEndpointCount.mockResolvedValue(10);
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: createBody(),
      })
    );
    expect(res.status).toBe(409);
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("400 when validateWebhookUrl fails", async () => {
    setupAuthed();
    mocks.validateWebhookUrl.mockResolvedValue({ ok: false, reason: "host_forbidden" });
    const res = await POST_CREATE(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: createBody(),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tenant/webhook-endpoints", () => {
  it("200 list has no secret key on items", async () => {
    setupAuthed();
    mocks.webhookEndpointFindMany.mockResolvedValue([publicRow]);
    const res = await GET_LIST(
      new Request("http://localhost/api/tenant/webhook-endpoints", { method: "GET" })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { items: Array<Record<string, unknown>> } };
    expect(json.data.items[0].secret).toBeUndefined();
    expect(json.data.items[0].secretHint).toBe("a1b2");
  });
});

describe("GET /api/tenant/webhook-endpoints/[endpointId]", () => {
  it("404 cross-tenant / missing (concealment)", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue(null);
    const res = await GET_DETAIL(
      new Request("http://localhost", { method: "GET" }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("200 detail has no secret field", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue(publicRow);
    const res = await GET_DETAIL(
      new Request("http://localhost", { method: "GET" }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.secret).toBeUndefined();
  });
});
