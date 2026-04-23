import { describe, expect, it } from "vitest";
import { authOptions } from "@/server/auth-options";

/** NextAuth v4 provider factories keep user `authorization` on `options` (defaults stay top-level). */
function getUserAuthorizationParams(provider: unknown): Record<string, unknown> | undefined {
  const p = provider as {
    options?: { authorization?: { params?: Record<string, unknown> } };
  };
  return p.options?.authorization?.params;
}

function getProvider(id: string) {
  const list = authOptions.providers ?? [];
  return list.find((p) => "id" in p && p.id === id);
}

describe("auth-options OAuth providers — account picker params", () => {
  it("Google has options.authorization.params.prompt === select_account", () => {
    const google = getProvider("google");
    expect(google).toBeDefined();
    const params = getUserAuthorizationParams(google);
    expect(params?.prompt).toBe("select_account");
  });

  it("Azure AD has options.authorization.params.prompt === select_account", () => {
    const azure = getProvider("azure-ad");
    expect(azure).toBeDefined();
    const params = getUserAuthorizationParams(azure);
    expect(params?.prompt).toBe("select_account");
  });

  it("Azure AD preserves scope openid profile email User.Read in options.authorization.params", () => {
    const azure = getProvider("azure-ad");
    expect(azure).toBeDefined();
    const params = getUserAuthorizationParams(azure);
    expect(params?.scope).toBe("openid profile email User.Read");
  });
});
