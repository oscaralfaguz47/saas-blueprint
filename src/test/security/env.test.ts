import { describe, it, expect } from "vitest";

describe("env module", () => {
  it("exports an env object with required keys when validation succeeds", async () => {
    const { env } = await import("@/lib/env");
    expect(env).toBeDefined();
    expect(typeof env).toBe("object");
    expect("DATABASE_URL" in env).toBe(true);
    expect("NEXTAUTH_SECRET" in env).toBe(true);
  });
});
