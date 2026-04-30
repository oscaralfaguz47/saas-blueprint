import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  vendorUserRoleFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    vendorUserRole: { findMany: mocks.vendorUserRoleFindMany },
  },
}));

import { hasVendorPermission } from "@/server/security/vendor-authorization";

describe("hasVendorPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when user has no VendorUserRole rows (no legacy bypass)", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.vendorUserRoleFindMany.mockResolvedValue([]);

    const ok = await hasVendorPermission({
      userId: "u1",
      permission: "admin.tenants.read",
    });

    expect(ok).toBe(false);
    expect(mocks.vendorUserRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  it("returns true when a vendor role grants the permission", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.vendorUserRoleFindMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permission: { code: "admin.tenants.read" } }],
        },
      },
    ]);

    const ok = await hasVendorPermission({
      userId: "u1",
      permission: "admin.tenants.read",
    });

    expect(ok).toBe(true);
  });

  it("returns false when user is platform-blocked even if roles exist", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    mocks.vendorUserRoleFindMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permission: { code: "admin.tenants.read" } }],
        },
      },
    ]);

    const ok = await hasVendorPermission({
      userId: "u1",
      permission: "admin.tenants.read",
    });

    expect(ok).toBe(false);
    expect(mocks.vendorUserRoleFindMany).not.toHaveBeenCalled();
  });
});
