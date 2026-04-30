import { describe, it, expect } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { ApiErrors, withErrorHandler, apiSuccess } from "@/lib/api-response";
import { LegacyFieldRemovedError } from "@/lib/validations/common";

describe("ApiErrors", () => {
  it("UNAUTHENTICATED returns 401", async () => {
    const res = ApiErrors.UNAUTHENTICATED();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("FORBIDDEN returns 403", async () => {
    const res = ApiErrors.FORBIDDEN();
    expect(res.status).toBe(403);
  });

  it("NOT_FOUND returns 404", async () => {
    const res = ApiErrors.NOT_FOUND();
    expect(res.status).toBe(404);
  });

  it("CONFLICT returns 409", async () => {
    const res = ApiErrors.CONFLICT();
    expect(res.status).toBe(409);
  });

  it("RATE_LIMITED returns 429 with Retry-After header", async () => {
    const res = ApiErrors.RATE_LIMITED("Too many requests", { retryAfterSeconds: 45 });
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBe("45");
  });

  it("UPGRADE_REQUIRED returns 403 with correct code", async () => {
    const res = ApiErrors.UPGRADE_REQUIRED();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("withErrorHandler", () => {
  it("passes through successful responses", async () => {
    const handler = withErrorHandler(async () => apiSuccess({ ok: true }));
    const res = await handler();
    expect(res.status).toBe(200);
  });

  it("maps P2002 Prisma error to 409", async () => {
    const handler = withErrorHandler(async () => {
      throw new PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.0.0",
        meta: { target: ["email"] },
      });
    });
    const res = await handler();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  it("maps P2025 Prisma error to 404", async () => {
    const handler = withErrorHandler(async () => {
      throw new PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "6.0.0",
      });
    });
    const res = await handler();
    expect(res.status).toBe(404);
  });

  it("returns 500 for unexpected errors without leaking details", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("SELECT * FROM users WHERE id = 'internal query detail'");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("SELECT");
    expect(text).not.toContain("internal query detail");
  });

  it("handles PAYLOAD_TOO_LARGE sentinel", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("PAYLOAD_TOO_LARGE");
    });
    const res = await handler();
    expect(res.status).toBe(413);
  });

  it("handles UNSUPPORTED_MEDIA_TYPE sentinel", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("UNSUPPORTED_MEDIA_TYPE");
    });
    const res = await handler();
    expect(res.status).toBe(415);
  });

  it("maps LegacyFieldRemovedError to 400 LEGACY_FIELD_REMOVED", async () => {
    const handler = withErrorHandler(async () => {
      throw new LegacyFieldRemovedError("amount", "Field 'amount' is no longer accepted.");
    });
    const res = await handler();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string; details?: { field?: string } } };
    expect(body.error?.code).toBe("LEGACY_FIELD_REMOVED");
    expect(body.error?.details?.field).toBe("amount");
  });
});
