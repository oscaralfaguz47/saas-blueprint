import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";
import { deliverWebhook } from "@/server/webhooks/deliver";
import { buildWebhookSignatureHeader } from "@/lib/webhooks/sign";

function mockPublicDns() {
  vi.mocked(lookup).mockImplementation(
    async () =>
      [{ address: "8.8.8.8", family: 4 }] as unknown as Awaited<
        ReturnType<typeof lookup>
      >
  );
}

const base = {
  url: "https://hooks.public.test/webhook",
  secret: "whsec_deliver_test_secret_long_enough",
  bodyUtf8: '{"envelope":true}',
  eventId: "evt_webhook_1",
  eventName: "record.closed",
  deliveryId: "dlv_cuid123",
  attempt: 3,
  payloadVersion: "v1" as const,
  timestampUnixSec: 1_700_000_000,
};

describe("deliverWebhook", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    mockPublicDns();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("URL validation failure → FAILED_FINAL and no fetch", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const r = await deliverWebhook({
      ...base,
      url: "https://127.0.0.1/nope",
    });

    expect(r.status).toBe("FAILED_FINAL");
    expect(r.errorMessage).toBe("ip_forbidden");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sets redirect manual, 5s timeout signal, body equals signing input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await deliverWebhook(base);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(base.url);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.body).toBe(base.bodyUtf8);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const h = init.headers as Record<string, string>;
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["User-Agent"]).toBe("Relitrue-Webhook/v1");
    expect(h["X-Relitrue-Event-Id"]).toBe(base.eventId);
    expect(h["X-Relitrue-Event-Name"]).toBe(base.eventName);
    expect(h["X-Relitrue-Payload-Version"]).toBe("v1");
    expect(h["X-Relitrue-Delivery-Id"]).toBe(base.deliveryId);
    expect(h["X-Relitrue-Delivery-Attempt"]).toBe("3");
    expect(h["X-Relitrue-Timestamp"]).toBe(String(base.timestampUnixSec));
    expect(h["X-Relitrue-Signature"]).toBe(
      buildWebhookSignatureHeader(base.bodyUtf8, base.secret)
    );
  });

  it("200 → SUCCEEDED", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("SUCCEEDED");
    expect(r.httpStatus).toBe(200);
    expect(r.responseExcerpt).toBe("body");
  });

  it("302 → FAILED_FINAL (not followed)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: "https://evil/" } })
      ) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_FINAL");
    expect(r.httpStatus).toBe(302);
  });

  it("410 → FAILED_FINAL", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("gone", { status: 410 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_FINAL");
    expect(r.httpStatus).toBe(410);
  });

  it("408 → FAILED_RETRY", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 408 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_RETRY");
    expect(r.httpStatus).toBe(408);
  });

  it("429 → FAILED_RETRY", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_RETRY");
    expect(r.httpStatus).toBe(429);
  });

  it("403 → FAILED_FINAL", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("no", { status: 403 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_FINAL");
    expect(r.httpStatus).toBe(403);
  });

  it("503 → FAILED_RETRY", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("err", { status: 503 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_RETRY");
    expect(r.httpStatus).toBe(503);
  });

  it("network failure → FAILED_RETRY", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.status).toBe("FAILED_RETRY");
    expect(r.errorMessage).toContain("ECONNRESET");
  });

  it("truncates response excerpt to 1000 chars", async () => {
    const long = "x".repeat(1500);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(long, { status: 200 })) as unknown as typeof fetch;

    const r = await deliverWebhook(base);
    expect(r.responseExcerpt?.length).toBe(1000);
  });
});
