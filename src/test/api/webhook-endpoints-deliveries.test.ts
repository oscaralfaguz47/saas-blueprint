import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireFullSession: vi.fn(),
  getDefaultTenantForUser: vi.fn(),
  hasTenantPermission: vi.fn(),
  userFindUnique: vi.fn(),
  webhookEndpointFindFirst: vi.fn(),
  webhookDeliveryFindMany: vi.fn(),
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
    webhookEndpoint: { findFirst: mocks.webhookEndpointFindFirst },
    webhookDelivery: { findMany: mocks.webhookDeliveryFindMany },
  },
}));

import { GET as GET_DELIVERIES } from "@/app/api/tenant/webhook-endpoints/[endpointId]/deliveries/route";

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

function deliveryRow(i: number) {
  const t = new Date(`2026-01-0${Math.min(i + 1, 9)}T12:00:00.000Z`);
  return {
    id: `cldelivery0000000000${i}`,
    eventName: "record.created",
    eventId: `evt${i}`,
    payloadVersion: "v1",
    status: "SUCCEEDED" as const,
    attemptCount: 1,
    maxAttempts: 8,
    nextAttemptAt: null as Date | null,
    lastResponseStatus: 200,
    lastResponseDurationMs: 10,
    lastResponseBodyExcerpt: "ok",
    lastErrorMessage: null as string | null,
    createdAt: t,
    succeededAt: t,
    finalFailedAt: null as Date | null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webhookEndpointFindFirst.mockResolvedValue({ id: EP_ID });
  mocks.webhookDeliveryFindMany.mockResolvedValue([]);
});

describe("GET /api/tenant/webhook-endpoints/[endpointId]/deliveries", () => {
  it("401 when unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    mocks.requireFullSession.mockResolvedValue(null);
    const res = await GET_DELIVERIES(new Request("http://localhost", { method: "GET" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("404 when endpoint missing or cross-tenant (concealment)", async () => {
    setupAuthed();
    mocks.webhookEndpointFindFirst.mockResolvedValue(null);
    const res = await GET_DELIVERIES(new Request("http://localhost", { method: "GET" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("400 when endpointId is not a valid cuid", async () => {
    setupAuthed();
    const res = await GET_DELIVERIES(new Request("http://localhost", { method: "GET" }), {
      params: Promise.resolve({ endpointId: "not-a-cuid" }),
    });
    expect(res.status).toBe(400);
    expect(mocks.webhookEndpointFindFirst).not.toHaveBeenCalled();
  });

  it("400 when status filter is invalid", async () => {
    setupAuthed();
    const res = await GET_DELIVERIES(
      new Request(`http://localhost?status=NOPE`, { method: "GET" }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(400);
    expect(mocks.webhookDeliveryFindMany).not.toHaveBeenCalled();
  });

  it("200 returns items without payload field", async () => {
    setupAuthed();
    mocks.webhookDeliveryFindMany.mockResolvedValue([deliveryRow(0)]);
    const res = await GET_DELIVERIES(new Request("http://localhost", { method: "GET" }), {
      params: Promise.resolve({ endpointId: EP_ID }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { items: Array<Record<string, unknown>> } };
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0].payload).toBeUndefined();
    expect(json.data.items[0].eventName).toBe("record.created");
  });

  it("pagination: returns nextCursor when more than limit rows", async () => {
    setupAuthed();
    const many = Array.from({ length: 21 }, (_, i) => deliveryRow(i));
    mocks.webhookDeliveryFindMany.mockResolvedValueOnce(many);
    const res = await GET_DELIVERIES(
      new Request("http://localhost?limit=20", { method: "GET" }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { items: unknown[]; nextCursor: string | null };
    };
    expect(json.data.items).toHaveLength(20);
    expect(json.data.nextCursor).toBeTruthy();

    mocks.webhookDeliveryFindMany.mockResolvedValueOnce([deliveryRow(99)]);
    const res2 = await GET_DELIVERIES(
      new Request(`http://localhost?limit=20&cursor=${encodeURIComponent(json.data.nextCursor!)}`, {
        method: "GET",
      }),
      { params: Promise.resolve({ endpointId: EP_ID }) }
    );
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { data: { items: unknown[] } };
    expect(json2.data.items.length).toBeGreaterThanOrEqual(1);
  });
});
