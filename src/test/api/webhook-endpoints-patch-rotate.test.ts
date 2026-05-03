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

import { PATCH as PATCH_EP } from "@/app/api/tenant/webhook-endpoints/[endpointId]/route";
import { POST as POST_ROTATE } from "@/app/api/tenant/webhook-endpoints/[endpointId]/rotate-secret/route";

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

describe("PATCH /api/tenant/webhook-endpoints/[endpointId]", () => {
  it("400 strict reject unknown url field", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue({
      ...publicRow,
      subscribedEvents: ["record.created"],
    });
    const res = await PATCH_EP(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://evil.com" }),
      }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 when status is DISABLED_AUTO (not in schema)", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue({
      id: EP_ID,
      name: "X",
      description: null,
      url: "https://example.com",
      subscribedEvents: ["record.created"],
      status: "ACTIVE",
    });
    const res = await PATCH_EP(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISABLED_AUTO" }),
      }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("403 UPGRADE_REQUIRED when activating from PAUSED on free plan", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue({
      id: EP_ID,
      name: "X",
      description: null,
      url: "https://example.com",
      subscribedEvents: ["record.created"],
      status: "PAUSED",
    });
    mocks.resolveTenantPlan.mockResolvedValue({ features: { webhooks: false } });
    const res = await PATCH_EP(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { details?: { code?: string } } };
    expect(body.error.details?.code).toBe("UPGRADE_REQUIRED");
  });

  it("200 PAUSED without plan gate", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue({
      id: EP_ID,
      name: "X",
      description: null,
      url: "https://example.com",
      subscribedEvents: ["record.created"],
      status: "ACTIVE",
    });
    mocks.resolveTenantPlan.mockResolvedValue({ features: { webhooks: false } });
    const res = await PATCH_EP(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(200);
  });
});

describe("POST .../rotate-secret", () => {
  it("403 when plan blocks webhooks", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue({ id: EP_ID, name: "N" });
    mocks.resolveTenantPlan.mockResolvedValue({ features: { webhooks: false } });
    const res = await POST_ROTATE(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { details?: { code?: string } } };
    expect(body.error.details?.code).toBe("UPGRADE_REQUIRED");
  });
});
