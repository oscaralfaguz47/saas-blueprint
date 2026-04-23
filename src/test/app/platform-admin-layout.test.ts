import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  getServerSession: vi.fn(),
  requireFullSessionRsc: vi.fn(),
  hasVendorPermission: vi.fn(),
  userFindUnique: vi.fn(),
  vendorUserRoleFindFirst: vi.fn(),
  getPresignedGetUrlProfilePhoto: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/server/require-full-session-rsc", () => ({
  requireFullSessionRsc: mocks.requireFullSessionRsc,
}));

vi.mock("@/server/security/vendor-authorization", () => ({
  hasVendorPermission: mocks.hasVendorPermission,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    vendorUserRole: { findFirst: mocks.vendorUserRoleFindFirst },
  },
}));

vi.mock("@/server/services/r2-profile-photo", () => ({
  getPresignedGetUrlProfilePhoto: mocks.getPresignedGetUrlProfilePhoto,
  isR2Configured: () => false,
}));

vi.mock("@/components/app/app-layout-hydration-gate", () => ({
  AppLayoutHydrationGate: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/components/app/admin/admin-subnav", () => ({
  AdminSubnav: () => null,
}));

import PlatformAdminLayout from "@/app/(platform-admin)/layout";

function baseUser(overrides?: Partial<Record<string, unknown>>) {
  return {
    isPlatformBlocked: false,
    name: "User",
    email: "user@example.com",
    image: null,
    profilePhotoObjectKey: null,
    appearance: "SYSTEM",
    role: "ADMIN",
    security: { totpEnabled: true },
    ...overrides,
  };
}

describe("platform-admin layout auth checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "u1", email: "user@example.com" } });
    mocks.requireFullSessionRsc.mockResolvedValue({
      user: { id: "u1", email: "user@example.com", name: "User" },
    });
    mocks.userFindUnique.mockResolvedValue(baseUser());
    mocks.hasVendorPermission.mockResolvedValue(true);
    mocks.vendorUserRoleFindFirst.mockResolvedValue({ userId: "u1" });
    mocks.getPresignedGetUrlProfilePhoto.mockResolvedValue(null);
  });

  it("redirects blocked users to /unauthorized", async () => {
    mocks.userFindUnique.mockResolvedValue(baseUser({ isPlatformBlocked: true }));

    await expect(
      PlatformAdminLayout({ children: "x" })
    ).rejects.toThrow("REDIRECT:/unauthorized");
  });

  it("redirects when UserSecurity row is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(baseUser({ security: null }));

    await expect(
      PlatformAdminLayout({ children: "x" })
    ).rejects.toThrow("REDIRECT:/app/account?tab=security&vendorSetup2fa=1");
  });

  it("redirects when totpEnabled is false", async () => {
    mocks.userFindUnique.mockResolvedValue(baseUser({ security: { totpEnabled: false } }));

    await expect(
      PlatformAdminLayout({ children: "x" })
    ).rejects.toThrow("REDIRECT:/app/account?tab=security&vendorSetup2fa=1");
  });

  it("redirects to unauthorized when vendor permission check fails", async () => {
    mocks.hasVendorPermission.mockResolvedValueOnce(false);

    await expect(
      PlatformAdminLayout({ children: "x" })
    ).rejects.toThrow("REDIRECT:/unauthorized");
  });

  it("renders children when user has totp and platform permission", async () => {
    const result = await PlatformAdminLayout({ children: "layout-children" });
    expect(result).toBeDefined();
  });
});
