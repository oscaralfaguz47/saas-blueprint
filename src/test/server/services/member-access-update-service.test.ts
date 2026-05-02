import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  MemberAccessUpdateError,
  updateMemberAccessInTransaction,
} from "@/server/services/member-access-update-service";

function fakeTx(overrides: {
  targetRow: Record<string, unknown>;
  actorRow: Record<string, unknown>;
  invariantRow?: Record<string, unknown> | null;
}) {
  const { targetRow, actorRow, invariantRow } = overrides;
  const inv = invariantRow ?? {
    status: "ACTIVE",
    workspaceRole: targetRow.workspaceRole,
    financialAccess: targetRow.financialAccess,
    financeResponsibility: targetRow.financeResponsibility,
    billingAccess: targetRow.billingAccess,
  };
  const findFirst = vi.fn().mockImplementation(() => {
    const n = findFirst.mock.calls.length;
    if (n === 1) return Promise.resolve(targetRow);
    return Promise.resolve(inv);
  });
  const findUnique = vi.fn().mockResolvedValue(actorRow);
  const update = vi.fn().mockResolvedValue({});
  const count = vi.fn().mockResolvedValue(1);
  const auditCreate = vi.fn().mockResolvedValue({});
  const tenantRoleFindMany = vi.fn().mockResolvedValue([
    { id: "rid-owner", name: "Owner" },
    { id: "rid-admin", name: "Admin" },
    { id: "rid-finance", name: "Finance" },
    { id: "rid-member", name: "Member" },
  ]);
  const turDelete = vi.fn().mockResolvedValue({ count: 1 });
  const turCreate = vi.fn().mockResolvedValue({});
  const turCount = vi.fn().mockResolvedValue(2);

  const tx = {
    tenantMembership: { findFirst, findUnique, update, count },
    tenantRole: { findMany: tenantRoleFindMany },
    tenantUserRole: {
      deleteMany: turDelete,
      create: turCreate,
      count: turCount,
    },
    auditLog: { create: auditCreate },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, findFirst, findUnique, update, auditCreate, turDelete, turCreate };
}

describe("updateMemberAccessInTransaction", () => {
  it("throws MemberAccessUpdateError MEMBER_ACCESS_HIERARCHY when actor rank equals target (D-1a A1)", async () => {
    const row = {
      id: "mem1",
      userId: "user-target",
      status: "ACTIVE",
      workspaceRole: "MEMBER",
      financialAccess: "OWN_AND_PARTICIPATING",
      financeResponsibility: "NONE",
      billingAccess: "NONE",
      roles: [{ role: { name: "Admin" } }],
    };
    const { tx } = fakeTx({
      targetRow: row,
      actorRow: { roles: [{ role: { name: "Admin" } }] },
    });

    await expect(
      updateMemberAccessInTransaction({
        tx,
        tenantId: "tenant1",
        membershipId: "mem1",
        actorUserId: "user-actor",
        patch: { financialAccess: "ALL" },
        ipAddress: null,
        userAgent: null,
      })
    ).rejects.toMatchObject({
      name: "MemberAccessUpdateError",
      httpStatus: 403,
      details: { code: "MEMBER_ACCESS_HIERARCHY" },
    });
  });

  it("updates financialAccess and writes unified audit with role in metadata", async () => {
    const row = {
      id: "mem1",
      userId: "user-target",
      status: "ACTIVE",
      workspaceRole: "MEMBER",
      financialAccess: "OWN_AND_PARTICIPATING",
      financeResponsibility: "NONE",
      billingAccess: "NONE",
      roles: [{ role: { name: "Member" } }],
    };
    const { tx, update, auditCreate } = fakeTx({
      targetRow: row,
      actorRow: { roles: [{ role: { name: "Admin" } }] },
    });

    const result = await updateMemberAccessInTransaction({
      tx,
      tenantId: "tenant1",
      membershipId: "mem1",
      actorUserId: "user-actor",
      patch: { financialAccess: "ALL" },
      ipAddress: null,
      userAgent: null,
    });

    expect(result.after.financialAccess).toBe("ALL");
    expect(result.after.role).toBe("Member");
    expect(update).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tenant.member.access_updated",
          metadata: expect.objectContaining({
            fieldsChanged: ["financialAccess"],
            before: expect.objectContaining({ role: "Member" }),
            after: expect.objectContaining({ role: "Member", financialAccess: "ALL" }),
          }),
        }),
      })
    );
  });
});
