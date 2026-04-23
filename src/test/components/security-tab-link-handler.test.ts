import { describe, expect, it } from "vitest";
import {
  buildLinkIntentCookieValue,
  parseLinkInitiateResponse,
} from "@/components/app/account/security-tab";

describe("SecurityTab link provider helpers", () => {
  it("extracts token from apiSuccess envelope", () => {
    const result = parseLinkInitiateResponse(true, {
      data: { token: "abc123" },
    });
    expect(result).toEqual({ token: "abc123", errorMessage: null });
  });

  it("uses server error message from standard error envelope", () => {
    const result = parseLinkInitiateResponse(false, {
      error: { code: "FORBIDDEN", message: "Insufficient permissions" },
    });
    expect(result).toEqual({
      token: null,
      errorMessage: "Insufficient permissions",
    });
  });

  it("falls back to human message when initiate payload is malformed", () => {
    const result = parseLinkInitiateResponse(false, {});
    expect(result).toEqual({
      token: null,
      errorMessage: "Failed to initiate linking. Please try again.",
    });
  });

  it("builds cookie with Secure and SameSite=Lax", () => {
    const cookie = buildLinkIntentCookieValue("google", "abc123");
    expect(cookie).toContain("__link_intent_google=abc123");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });
});
