import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody } from "@/lib/validations";
import { makeRequest } from "../factories";

const testSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
});

describe("parseBody — Content-Type enforcement", () => {
  it("accepts application/json", async () => {
    const req = makeRequest({
      body: { name: "test", value: 42 },
      headers: { "content-type": "application/json" },
    });
    const result = await parseBody(req, testSchema);
    expect(result.name).toBe("test");
    expect(result.value).toBe(42);
  });

  it("accepts application/json with charset", async () => {
    const req = makeRequest({
      body: { name: "test", value: 42 },
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    await expect(parseBody(req, testSchema)).resolves.toBeDefined();
  });

  it("rejects missing Content-Type", async () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "test", value: 42 }),
    });
    await expect(parseBody(req, testSchema)).rejects.toThrow("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects text/plain Content-Type", async () => {
    const req = makeRequest({
      body: { name: "test", value: 42 },
      headers: { "content-type": "text/plain" },
    });
    await expect(parseBody(req, testSchema)).rejects.toThrow("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects multipart/form-data on JSON endpoints", async () => {
    const req = makeRequest({
      body: { name: "test", value: 42 },
      headers: { "content-type": "multipart/form-data" },
    });
    await expect(parseBody(req, testSchema)).rejects.toThrow("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("parseBody — Size limit enforcement", () => {
  it("rejects body larger than 1MB via Content-Length header", async () => {
    const req = makeRequest({
      body: { name: "test", value: 42 },
      headers: {
        "content-type": "application/json",
        "content-length": String(2 * 1024 * 1024),
      },
    });
    await expect(parseBody(req, testSchema)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });

  it("rejects body that exceeds 1MB when read", async () => {
    const largeString = "x".repeat(Math.ceil(1.1 * 1024 * 1024));
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: largeString, value: 42 }),
    });
    await expect(parseBody(req, testSchema)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
});

describe("parseBody — Zod validation", () => {
  it("throws ValidationError for missing required fields", async () => {
    const req = makeRequest({
      body: { name: "test" },
    });
    await expect(parseBody(req, testSchema)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("throws ValidationError for wrong types", async () => {
    const req = makeRequest({
      body: { name: "test", value: "not-a-number" },
    });
    await expect(parseBody(req, testSchema)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("throws ValidationError for invalid JSON", async () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ invalid json {{",
    });
    await expect(parseBody(req, testSchema)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});
