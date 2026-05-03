import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";
import { validateWebhookUrl } from "@/server/webhooks/url-validation";

function mockLookupResult(addresses: Array<{ address: string; family: 4 | 6 }>) {
  vi.mocked(lookup).mockImplementation(
    async () => addresses as unknown as Awaited<ReturnType<typeof lookup>>
  );
}

describe("validateWebhookUrl", () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid URL", async () => {
    const r = await validateWebhookUrl("not a url");
    expect(r).toEqual({ ok: false, reason: "invalid_url" });
  });

  it("rejects http in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const r = await validateWebhookUrl("http://8.8.8.8/hook");
    expect(r).toEqual({ ok: false, reason: "non_https" });
  });

  it("allows http in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockLookupResult([{ address: "8.8.8.8", family: 4 }]);
    const r = await validateWebhookUrl("http://public.example/hook");
    expect(r).toEqual({ ok: true });
    expect(lookup).toHaveBeenCalledWith("public.example", {
      all: true,
      verbatim: true,
    });
  });

  it("rejects https with userinfo", async () => {
    const r = await validateWebhookUrl("https://user:pass@8.8.8.8/hook");
    expect(r).toEqual({ ok: false, reason: "invalid_url" });
  });

  it("rejects 127.0.0.1 without DNS", async () => {
    const r = await validateWebhookUrl("https://127.0.0.1/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects ::1 without DNS", async () => {
    const r = await validateWebhookUrl("https://[::1]/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects 10.0.0.5 (private IPv4)", async () => {
    const r = await validateWebhookUrl("https://10.0.0.5/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });

  it("rejects 172.20.0.1 (private IPv4)", async () => {
    const r = await validateWebhookUrl("https://172.20.0.1/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });

  it("rejects 192.168.1.1", async () => {
    const r = await validateWebhookUrl("https://192.168.1.1/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });

  it("rejects 169.254.169.254 (metadata / link-local IPv4 range)", async () => {
    const r = await validateWebhookUrl("https://169.254.169.254/latest");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });

  it("rejects localhost hostname", async () => {
    const r = await validateWebhookUrl("https://localhost/hook");
    expect(r).toEqual({ ok: false, reason: "host_forbidden" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("passes public IPv4 https without DNS on literal", async () => {
    const r = await validateWebhookUrl("https://8.8.8.8/hook");
    expect(r).toEqual({ ok: true });
  });

  it("resolves hostname and accepts public IP", async () => {
    mockLookupResult([{ address: "8.8.8.8", family: 4 }]);
    const r = await validateWebhookUrl("https://dns.test/hook");
    expect(r).toEqual({ ok: true });
  });

  it("dual-stack: rejects if any resolved address is private", async () => {
    mockLookupResult([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    const r = await validateWebhookUrl("https://mixed.test/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });

  it("rejects on DNS failure", async () => {
    vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
    const r = await validateWebhookUrl("https://nope.example/hook");
    expect(r).toEqual({ ok: false, reason: "dns_failed" });
  });

  it("rejects on DNS timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockImplementation(
      () => new Promise(() => { /* never resolves */ })
    );
    const p = validateWebhookUrl("https://slow.test/hook");
    await vi.advanceTimersByTimeAsync(5000);
    const r = await p;
    expect(r).toEqual({ ok: false, reason: "dns_timeout" });
    vi.useRealTimers();
  });

  it("rejects ULA IPv6 (fd00::/8 in fc00::/7)", async () => {
    const r = await validateWebhookUrl("https://[fd12::1]/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });

  it("rejects fe80::1 link-local IPv6", async () => {
    const r = await validateWebhookUrl("https://[fe80::1]/hook");
    expect(r).toEqual({ ok: false, reason: "ip_forbidden" });
  });
});
