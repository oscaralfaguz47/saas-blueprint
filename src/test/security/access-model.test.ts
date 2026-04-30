import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  tenantMembershipFindUnique: vi.fn(),
}));

/**
 * React `cache()` does not dedupe across top-level awaits in Vitest (no request scope).
 * Memoize by serialized args so we can assert a single Prisma call matches production intent.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) => {
      const store = new Map<string, R>();
      return ((...args: A): R => {
        const key = JSON.stringify(args);
        if (!store.has(key)) {
          store.set(key, fn(...args));
        }
        return store.get(key) as R;
      }) as (...args: A) => R;
    },
  };
});

vi.mock("@/server/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    tenantMembership: { findUnique: mocks.tenantMembershipFindUnique },
  },
}));

import {
  canPerformBillingAction,
  canPerformFinanceAction,
  canPerformWorkspaceAction,
  getMembership4Axis,
  getUserPlatformBlocked,
  hasAccess,
  validate4AxisCombination,
} from "@/server/security/access-model";

function activeMembership(overrides?: Partial<{
  membershipId: string;
  workspaceRole: "OWNER" | "ADMIN" | "MEMBER";
  financialAccess: "ALL" | "DEPARTMENT" | "OWN_AND_PARTICIPATING" | "NONE";
  financeResponsibility: "PROCESS" | "APPROVE" | "PROCESS_AND_APPROVE" | "NONE";
  billingAccess: "MANAGE" | "READ" | "NONE";
}>) {
  return {
    membershipId: overrides?.membershipId ?? "mem1",
    status: "ACTIVE" as const,
    workspaceRole: overrides?.workspaceRole ?? "MEMBER",
    financialAccess: overrides?.financialAccess ?? "OWN_AND_PARTICIPATING",
    financeResponsibility: overrides?.financeResponsibility ?? "NONE",
    billingAccess: overrides?.billingAccess ?? "NONE",
  };
}

describe("getUserPlatformBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when user is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(getUserPlatformBlocked("u-pb-missing")).resolves.toBe(false);
  });

  it("returns false when user is not platform-blocked", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    await expect(getUserPlatformBlocked("u-pb-ok")).resolves.toBe(false);
  });

  it("returns true when user is platform-blocked", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    await expect(getUserPlatformBlocked("u-pb-blocked")).resolves.toBe(true);
  });
});

describe("getMembership4Axis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for non-existent membership", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);
    await expect(
      getMembership4Axis({ tenantId: "t-mem-none", userId: "u-mem-none" })
    ).resolves.toBeNull();
  });

  it("returns null for INVITED status", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: "m1",
      status: "INVITED",
      workspaceRole: "MEMBER",
      financialAccess: "OWN_AND_PARTICIPATING",
      financeResponsibility: "NONE",
      billingAccess: "NONE",
    });
    await expect(
      getMembership4Axis({ tenantId: "t-mem-inv", userId: "u-mem-inv" })
    ).resolves.toBeNull();
  });

  it("returns null for DISABLED status", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: "m1",
      status: "DISABLED",
      workspaceRole: "MEMBER",
      financialAccess: "OWN_AND_PARTICIPATING",
      financeResponsibility: "NONE",
      billingAccess: "NONE",
    });
    await expect(
      getMembership4Axis({ tenantId: "t-mem-dis", userId: "u-mem-dis" })
    ).resolves.toBeNull();
  });

  it("returns 4-axis data for ACTIVE membership", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: "m1",
      status: "ACTIVE",
      workspaceRole: "ADMIN",
      financialAccess: "ALL",
      financeResponsibility: "PROCESS_AND_APPROVE",
      billingAccess: "READ",
    });
    await expect(
      getMembership4Axis({ tenantId: "t-mem-act", userId: "u-mem-act" })
    ).resolves.toEqual({
      membershipId: "m1",
      status: "ACTIVE",
      workspaceRole: "ADMIN",
      financialAccess: "ALL",
      financeResponsibility: "PROCESS_AND_APPROVE",
      billingAccess: "READ",
    });
  });

  it("React cache deduplicates: same tenantId+userId only hits Prisma once", async () => {
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: "m-dedup",
      status: "ACTIVE",
      workspaceRole: "MEMBER",
      financialAccess: "NONE",
      financeResponsibility: "NONE",
      billingAccess: "NONE",
    });
    const a = await getMembership4Axis({ tenantId: "t-dedup", userId: "u-dedup" });
    const b = await getMembership4Axis({ tenantId: "t-dedup", userId: "u-dedup" });
    expect(a).toEqual(b);
    expect(mocks.tenantMembershipFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe("canPerformFinanceAction", () => {
  it("finance.records.view_all: true only for ALL", () => {
    expect(
      canPerformFinanceAction(activeMembership({ financialAccess: "ALL" }), "finance.records.view_all")
    ).toBe(true);
    for (const fa of ["DEPARTMENT", "OWN_AND_PARTICIPATING", "NONE"] as const) {
      expect(
        canPerformFinanceAction(activeMembership({ financialAccess: fa }), "finance.records.view_all")
      ).toBe(false);
    }
  });

  it("finance.records.view_department: true for ALL and DEPARTMENT", () => {
    expect(
      canPerformFinanceAction(activeMembership({ financialAccess: "ALL" }), "finance.records.view_department")
    ).toBe(true);
    expect(
      canPerformFinanceAction(
        activeMembership({ financialAccess: "DEPARTMENT" }),
        "finance.records.view_department"
      )
    ).toBe(true);
    expect(
      canPerformFinanceAction(
        activeMembership({ financialAccess: "OWN_AND_PARTICIPATING" }),
        "finance.records.view_department"
      )
    ).toBe(false);
    expect(
      canPerformFinanceAction(activeMembership({ financialAccess: "NONE" }), "finance.records.view_department")
    ).toBe(false);
  });

  it("finance.records.view_own_and_participating: true for ACTIVE membership", () => {
    expect(
      canPerformFinanceAction(
        activeMembership({ financialAccess: "NONE" }),
        "finance.records.view_own_and_participating"
      )
    ).toBe(true);
  });

  it("finance.records.process: true for PROCESS and PROCESS_AND_APPROVE", () => {
    expect(
      canPerformFinanceAction(
        activeMembership({ financeResponsibility: "PROCESS" }),
        "finance.records.process"
      )
    ).toBe(true);
    expect(
      canPerformFinanceAction(
        activeMembership({ financeResponsibility: "PROCESS_AND_APPROVE" }),
        "finance.records.process"
      )
    ).toBe(true);
    for (const fr of ["NONE", "APPROVE"] as const) {
      expect(
        canPerformFinanceAction(
          activeMembership({ financeResponsibility: fr }),
          "finance.records.process"
        )
      ).toBe(false);
    }
  });

  it("finance.records.approve: true for APPROVE and PROCESS_AND_APPROVE", () => {
    expect(
      canPerformFinanceAction(
        activeMembership({ financeResponsibility: "APPROVE" }),
        "finance.records.approve"
      )
    ).toBe(true);
    expect(
      canPerformFinanceAction(
        activeMembership({ financeResponsibility: "PROCESS_AND_APPROVE" }),
        "finance.records.approve"
      )
    ).toBe(true);
    for (const fr of ["NONE", "PROCESS"] as const) {
      expect(
        canPerformFinanceAction(
          activeMembership({ financeResponsibility: fr }),
          "finance.records.approve"
        )
      ).toBe(false);
    }
  });
});

describe("canPerformBillingAction", () => {
  it("billing.view: true for READ and MANAGE", () => {
    expect(canPerformBillingAction(activeMembership({ billingAccess: "READ" }), "billing.view")).toBe(
      true
    );
    expect(
      canPerformBillingAction(activeMembership({ billingAccess: "MANAGE" }), "billing.view")
    ).toBe(true);
    expect(canPerformBillingAction(activeMembership({ billingAccess: "NONE" }), "billing.view")).toBe(
      false
    );
  });

  it("billing.manage: true only for MANAGE", () => {
    expect(
      canPerformBillingAction(activeMembership({ billingAccess: "MANAGE" }), "billing.manage")
    ).toBe(true);
    expect(canPerformBillingAction(activeMembership({ billingAccess: "READ" }), "billing.manage")).toBe(
      false
    );
    expect(canPerformBillingAction(activeMembership({ billingAccess: "NONE" }), "billing.manage")).toBe(
      false
    );
  });
});

describe("canPerformWorkspaceAction", () => {
  it("workspace.admin: true for OWNER and ADMIN", () => {
    expect(canPerformWorkspaceAction(activeMembership({ workspaceRole: "OWNER" }), "workspace.admin")).toBe(
      true
    );
    expect(canPerformWorkspaceAction(activeMembership({ workspaceRole: "ADMIN" }), "workspace.admin")).toBe(
      true
    );
    expect(
      canPerformWorkspaceAction(activeMembership({ workspaceRole: "MEMBER" }), "workspace.admin")
    ).toBe(false);
  });

  it("workspace.manage_members: true for OWNER and ADMIN", () => {
    expect(
      canPerformWorkspaceAction(activeMembership({ workspaceRole: "OWNER" }), "workspace.manage_members")
    ).toBe(true);
    expect(
      canPerformWorkspaceAction(activeMembership({ workspaceRole: "ADMIN" }), "workspace.manage_members")
    ).toBe(true);
    expect(
      canPerformWorkspaceAction(activeMembership({ workspaceRole: "MEMBER" }), "workspace.manage_members")
    ).toBe(false);
  });
});

describe("hasAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when user is platform-blocked (no membership query)", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: true });
    const ok = await hasAccess({
      tenantId: "t-ha-pb",
      userId: "u-ha-pb",
      action: "finance.records.view_all",
    });
    expect(ok).toBe(false);
    expect(mocks.tenantMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("returns false when membership missing for tenant", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue(null);
    const ok = await hasAccess({
      tenantId: "t-ha-miss",
      userId: "u-ha-miss",
      action: "finance.records.view_all",
    });
    expect(ok).toBe(false);
  });

  it("tenant isolation: membership only in tenant A — hasAccess for tenant B is false", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockImplementation(
      async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => {
        if (args.where.tenantId_userId.tenantId === "tenant-a") {
          return {
            id: "m-a",
            status: "ACTIVE" as const,
            workspaceRole: "MEMBER" as const,
            financialAccess: "ALL" as const,
            financeResponsibility: "NONE" as const,
            billingAccess: "NONE" as const,
          };
        }
        return null;
      }
    );

    const okA = await hasAccess({
      tenantId: "tenant-a",
      userId: "user-1",
      action: "finance.records.view_all",
    });
    const okB = await hasAccess({
      tenantId: "tenant-b",
      userId: "user-1",
      action: "finance.records.view_all",
    });

    expect(okA).toBe(true);
    expect(okB).toBe(false);
  });

  it("finance.records.view_all respects membership axes", async () => {
    mocks.userFindUnique.mockResolvedValue({ isPlatformBlocked: false });
    mocks.tenantMembershipFindUnique.mockResolvedValue({
      id: "m1",
      status: "ACTIVE",
      workspaceRole: "MEMBER",
      financialAccess: "DEPARTMENT",
      financeResponsibility: "NONE",
      billingAccess: "NONE",
    });
    expect(
      await hasAccess({
        tenantId: "t-ha-fin",
        userId: "u-ha-fin",
        action: "finance.records.view_all",
      })
    ).toBe(false);
  });
});

describe("validate4AxisCombination", () => {
  it("returns OWNER_FINANCIAL_ACCESS_CANNOT_BE_NONE for OWNER + NONE financial", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "OWNER",
        financialAccess: "NONE",
        financeResponsibility: "NONE",
        billingAccess: "MANAGE",
      })
    ).toBe("OWNER_FINANCIAL_ACCESS_CANNOT_BE_NONE");
  });

  it("returns OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE for OWNER + DEPARTMENT", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "OWNER",
        financialAccess: "DEPARTMENT",
        financeResponsibility: "NONE",
        billingAccess: "MANAGE",
      })
    ).toBe("OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE");
  });

  it("returns OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE for OWNER + OWN_AND_PARTICIPATING", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "OWNER",
        financialAccess: "OWN_AND_PARTICIPATING",
        financeResponsibility: "APPROVE",
        billingAccess: "MANAGE",
      })
    ).toBe("OWNER_FINANCIAL_ACCESS_MUST_BE_ALL_SCOPE");
  });

  it("returns FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY when NONE visibility + PROCESS", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "ADMIN",
        financialAccess: "NONE",
        financeResponsibility: "PROCESS",
        billingAccess: "NONE",
      })
    ).toBe("FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY");
  });

  it("returns FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY for NONE + APPROVE", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "NONE",
        financeResponsibility: "APPROVE",
        billingAccess: "NONE",
      })
    ).toBe("FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY");
  });

  it("returns FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY for NONE + PROCESS_AND_APPROVE", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "NONE",
        financeResponsibility: "PROCESS_AND_APPROVE",
        billingAccess: "READ",
      })
    ).toBe("FINANCE_RESPONSIBILITY_REQUIRES_FINANCIAL_VISIBILITY");
  });

  it("returns DEPARTMENT_SCOPE_WITHOUT_DEPARTMENTS when count is 0 and scope DEPARTMENT", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "DEPARTMENT",
        financeResponsibility: "PROCESS",
        billingAccess: "NONE",
        assignedDepartmentCount: 0,
      })
    ).toBe("DEPARTMENT_SCOPE_WITHOUT_DEPARTMENTS");
  });

  it("does not apply department rule when assignedDepartmentCount omitted", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "DEPARTMENT",
        financeResponsibility: "PROCESS",
        billingAccess: "NONE",
      })
    ).toBe(null);
  });

  it("allows MEMBER + ALL + MANAGE billing", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "ALL",
        financeResponsibility: "NONE",
        billingAccess: "MANAGE",
      })
    ).toBe(null);
  });

  it("allows OWNER + ALL + billing NONE (tenant invariant deferred)", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        financeResponsibility: "NONE",
        billingAccess: "NONE",
      })
    ).toBe(null);
  });

  it("doc §9 Sarah (CEO) configuration is valid", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "OWNER",
        financialAccess: "ALL",
        financeResponsibility: "APPROVE",
        billingAccess: "MANAGE",
      })
    ).toBe(null);
  });

  it("doc §9 Marcus configuration is valid", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "ADMIN",
        financialAccess: "ALL",
        financeResponsibility: "PROCESS_AND_APPROVE",
        billingAccess: "READ",
      })
    ).toBe(null);
  });

  it("doc §9 Laura configuration is valid", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "DEPARTMENT",
        financeResponsibility: "PROCESS",
        billingAccess: "NONE",
      })
    ).toBe(null);
  });

  it("doc §9 Diego configuration is valid", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "MEMBER",
        financialAccess: "DEPARTMENT",
        financeResponsibility: "APPROVE",
        billingAccess: "NONE",
      })
    ).toBe(null);
  });

  it("doc §9 Patricia configuration is valid", () => {
    expect(
      validate4AxisCombination({
        workspaceRole: "ADMIN",
        financialAccess: "NONE",
        financeResponsibility: "NONE",
        billingAccess: "NONE",
      })
    ).toBe(null);
  });
});
