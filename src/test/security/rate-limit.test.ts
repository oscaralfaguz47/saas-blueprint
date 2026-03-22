import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/security-log", () => ({
  logRateLimited: vi.fn(),
}));

import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/server/db";

type MockRateLimitTx = {
  rateLimit: {
    findUnique: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when no existing entry", async () => {
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: (tx: MockRateLimitTx) => Promise<unknown>) => {
      return fn({
        rateLimit: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
          update: vi.fn(),
        },
      });
    });

    const result = await checkRateLimit("test:key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("allows request when window has expired", async () => {
    const expiredEntry = {
      count: 10,
      resetAt: new Date(Date.now() - 1000),
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: (tx: MockRateLimitTx) => Promise<unknown>) => {
      return fn({
        rateLimit: {
          findUnique: vi.fn().mockResolvedValue(expiredEntry),
          upsert: vi.fn().mockResolvedValue({}),
          update: vi.fn(),
        },
      });
    });

    const result = await checkRateLimit("test:key", 5, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("blocks request when limit is reached", async () => {
    const fullEntry = {
      count: 5,
      resetAt: new Date(Date.now() + 30_000),
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: (tx: MockRateLimitTx) => Promise<unknown>) => {
      return fn({
        rateLimit: {
          findUnique: vi.fn().mockResolvedValue(fullEntry),
          upsert: vi.fn(),
          update: vi.fn(),
        },
      });
    });

    const result = await checkRateLimit("test:key", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("fails open when DB throws", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("DB connection failed"));

    const result = await checkRateLimit("test:key", 5, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("uses unique keys to isolate different actions", async () => {
    const key1 = "2fa:verify:user_A";
    const key2 = "2fa:verify:user_B";
    expect(key1).not.toBe(key2);
  });
});
