import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  vendorRoleFindUnique: vi.fn(),
  vendorUserRoleFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  txVendorUserRoleCreate: vi.fn(),
  txAuditLogCreate: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    BOOTSTRAP_ADMIN_EMAIL: "bootstrap@example.com,other@example.com",
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    vendorRole: { findUnique: mocks.vendorRoleFindUnique },
    vendorUserRole: { findUnique: mocks.vendorUserRoleFindUnique },
    user: { update: mocks.userUpdate },
    $transaction: mocks.$transaction,
  },
}));

import { ensureBootstrapPlatformOwner } from "@/server/services/platform-bootstrap";

describe("ensureBootstrapPlatformOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.vendorRoleFindUnique.mockResolvedValue({ id: "role-platform-admin" });
    mocks.$transaction.mockImplementation(
      async (fn: (tx: {
        vendorUserRole: { create: typeof mocks.txVendorUserRoleCreate };
        auditLog: { create: typeof mocks.txAuditLogCreate };
      }) => Promise<void>) => {
        await fn({
          vendorUserRole: { create: mocks.txVendorUserRoleCreate },
          auditLog: { create: mocks.txAuditLogCreate },
        });
      }
    );
  });

  it("creates VendorUserRole(PlatformAdmin) for allowlisted email on first grant", async () => {
    mocks.vendorUserRoleFindUnique.mockResolvedValueOnce(null);

    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "bootstrap@example.com",
    });

    expect(mocks.txVendorUserRoleCreate).toHaveBeenCalledWith({
      data: { userId: "u1", roleId: "role-platform-admin" },
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when the VendorUserRole already exists", async () => {
    mocks.vendorUserRoleFindUnique.mockResolvedValue({ userId: "u1" });

    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "bootstrap@example.com",
    });

    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.txVendorUserRoleCreate).not.toHaveBeenCalled();
    expect(mocks.txAuditLogCreate).not.toHaveBeenCalled();
  });

  it("calling twice does not error (second call skips transaction)", async () => {
    mocks.vendorUserRoleFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "u1" });

    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "bootstrap@example.com",
    });
    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "bootstrap@example.com",
    });

    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });

  it("writes one audit log on first-time grant with expected action and metadata", async () => {
    mocks.vendorUserRoleFindUnique.mockResolvedValueOnce(null);

    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "Bootstrap@Example.com",
    });

    expect(mocks.txAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(mocks.txAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "u1",
        actorContext: "VENDOR",
        tenantId: null,
        action: "admin.vendor_user.role_assigned",
        targetType: "User",
        targetId: "u1",
        targetUserId: "u1",
        metadata: {
          roleName: "PlatformAdmin",
          method: "bootstrap_allowlist",
          grantedViaEmail: "bootstrap@example.com",
        },
      },
    });
  });

  it("second allowlisted call does not write an additional audit log", async () => {
    mocks.vendorUserRoleFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "u1" });

    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "bootstrap@example.com",
    });
    expect(mocks.txAuditLogCreate).toHaveBeenCalledTimes(1);

    await ensureBootstrapPlatformOwner({
      userId: "u1",
      email: "bootstrap@example.com",
    });

    expect(mocks.txAuditLogCreate).toHaveBeenCalledTimes(1);
  });
});
