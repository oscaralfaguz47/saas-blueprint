import { describe, expect, it } from "vitest";
import { buildOAuthPopupResultMessage } from "@/app/(auth)/auth/popup-callback/page";

describe("popup callback postMessage contract", () => {
  it("builds success payload when no error query param", () => {
    const message = buildOAuthPopupResultMessage(new URLSearchParams(""));
    expect(message).toEqual({
      type: "OAUTH_POPUP_RESULT",
      success: true,
      error: undefined,
      provider: undefined,
    });
  });

  it("forwards error and provider when present", () => {
    const message = buildOAuthPopupResultMessage(
      new URLSearchParams("error=link_email_mismatch&provider=azure-ad")
    );
    expect(message).toEqual({
      type: "OAUTH_POPUP_RESULT",
      success: false,
      error: "link_email_mismatch",
      provider: "azure-ad",
    });
  });

  it("forwards AccessDenied error without provider", () => {
    const message = buildOAuthPopupResultMessage(
      new URLSearchParams("error=AccessDenied")
    );
    expect(message).toEqual({
      type: "OAUTH_POPUP_RESULT",
      success: false,
      error: "AccessDenied",
      provider: undefined,
    });
  });
});
