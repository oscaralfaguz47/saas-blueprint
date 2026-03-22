import { describe, it, expect } from "vitest";
import { isSafeInternalRedirect } from "@/lib/safe-redirect";

describe("isSafeInternalRedirect", () => {
  describe("valid internal paths", () => {
    it("allows root path", () => {
      expect(isSafeInternalRedirect("/")).toBe(true);
    });
    it("allows app routes", () => {
      expect(isSafeInternalRedirect("/app/dashboard")).toBe(true);
    });
    it("allows nested paths", () => {
      expect(isSafeInternalRedirect("/app/settings/billing")).toBe(true);
    });
    it("allows paths with query strings", () => {
      expect(isSafeInternalRedirect("/app/records?status=active")).toBe(true);
    });
  });

  describe("open redirect vectors", () => {
    it("blocks protocol-relative URLs", () => {
      expect(isSafeInternalRedirect("//evil.com")).toBe(false);
    });
    it("blocks protocol-relative with path", () => {
      expect(isSafeInternalRedirect("//evil.com/path")).toBe(false);
    });
    it("blocks backslash protocol-relative", () => {
      expect(isSafeInternalRedirect("/\\evil.com")).toBe(false);
    });
    it("blocks https URLs", () => {
      expect(isSafeInternalRedirect("https://evil.com")).toBe(false);
    });
    it("blocks http URLs", () => {
      expect(isSafeInternalRedirect("http://evil.com")).toBe(false);
    });
    it("blocks javascript protocol", () => {
      expect(isSafeInternalRedirect("javascript:alert(1)")).toBe(false);
    });
    it("blocks data URIs", () => {
      expect(isSafeInternalRedirect("data:text/html,<script>alert(1)</script>")).toBe(false);
    });
    it("blocks empty string", () => {
      expect(isSafeInternalRedirect("")).toBe(false);
    });
    it("blocks external absolute URLs", () => {
      expect(isSafeInternalRedirect("https://app.example.com.evil.com")).toBe(false);
    });
  });
});
