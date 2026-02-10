import "server-only";

import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { nameFromSlug } from "@/lib/validations";
import type { Prisma } from "@prisma/client";

/** Thrown when create-tenant fails because the slug is already in use. No retries. */
export class SlugTakenError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`That workspace URL is already taken. Please choose a different slug.`);
    this.name = "SlugTakenError";
    this.slug = slug;
  }
}

/** Thrown when create/update fails because the user already has a workspace with that name. */
export class WorkspaceNameTakenError extends Error {
  readonly workspaceName: string;
  constructor(workspaceName: string) {
    super(`You already have a workspace with that name. Please choose a different name.`);
    this.name = "WorkspaceNameTakenError";
    this.workspaceName = workspaceName;
  }
}

/**
 * Ensures no other workspace **of the same user** has the given name (case-insensitive).
 * Only compares against workspaces this user is a member of — not global uniqueness.
 * @param excludeTenantId - If set, this tenant is excluded (for renames).
 */
export async function assertWorkspaceNameUniqueForUser(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma,
  userId: string,
  name: string,
  excludeTenantId?: string
): Promise<void> {
  const currentUserId = userId;
  const existing = await tx.tenant.findFirst({
    where: {
      status: "ACTIVE",
      ...(excludeTenantId ? { id: { not: excludeTenantId } } : {}),
      memberships: {
        some: { userId: currentUserId, status: "ACTIVE" },
      },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) throw new WorkspaceNameTakenError(name);
}

/**
 * v1 bootstrap (robust + fast):
 * - If user has no default tenant, create one
 * - Ensure system tenant roles exist: Owner/Admin/Member
 * - Ensure minimal tenant permissions are attached to those roles
 *
 * IMPORTANT:
 * We keep the DB transaction short to avoid Prisma interactive transaction timeout (5s).
 * Heavy/iterative permission linking happens OUTSIDE the transaction.
 */
export async function ensureDefaultTenantForUser(params: {
  userId: string;
  userEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const { userId, userEmail, ipAddress, userAgent } = params;

  // Fast path: already has a default active tenant (legacy: ensureDefaultTenantForUser still creates ACTIVE for backward compatibility)
  const existing = await prisma.tenantMembership.findFirst({
    where: { userId, isDefaultTenant: true, status: "ACTIVE" },
    select: {
      id: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  if (existing?.tenant) return existing;

  // Keep tx small: create tenant + membership + roles + owner assignment only.
  const result = await prisma.$transaction(
    async (tx) => {
      // Re-check inside tx (race-safe best effort)
      const again = await tx.tenantMembership.findFirst({
        where: { userId, isDefaultTenant: true, status: "ACTIVE" },
        select: {
          id: true,
          tenant: { select: { id: true, name: true, slug: true, status: true } },
        },
      });
      if (again?.tenant) return again;

      const baseName = (userEmail?.split("@")[0] ?? "workspace").slice(0, 30);
      const slug = await generateUniqueTenantSlug(tx, baseName);

      const tenant = await tx.tenant.create({
        data: {
          name: `${baseName}'s Workspace`,
          slug,
          status: "ACTIVE",
          createdByUserId: userId,
        },
        select: { id: true, name: true, slug: true, status: true },
      });

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId,
          status: "ACTIVE",
          joinedAt: new Date(),
          isDefaultTenant: true,
        },
        select: { id: true, tenantId: true },
      });

      // Ensure system roles exist (idempotent). Aligned with A2: Owner, Admin, Finance, Member.
      const [ownerRole, adminRole, financeRole, memberRole] = await Promise.all([
        tx.tenantRole.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: "Owner" } },
          update: { isSystem: true },
          create: { tenantId: tenant.id, name: "Owner", isSystem: true },
          select: { id: true, name: true },
        }),
        tx.tenantRole.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: "Admin" } },
          update: { isSystem: true },
          create: { tenantId: tenant.id, name: "Admin", isSystem: true },
          select: { id: true, name: true },
        }),
        tx.tenantRole.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: "Finance" } },
          update: { isSystem: true },
          create: { tenantId: tenant.id, name: "Finance", isSystem: true },
          select: { id: true, name: true },
        }),
        tx.tenantRole.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: "Member" } },
          update: { isSystem: true },
          create: { tenantId: tenant.id, name: "Member", isSystem: true },
          select: { id: true, name: true },
        }),
      ]);

      // Assign Owner role to the creator membership (idempotent)
      await tx.tenantUserRole.upsert({
        where: {
          membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id },
        },
        update: {},
        create: { membershipId: membership.id, roleId: ownerRole.id },
      });

      return {
        id: membership.id,
        tenant,
      };
    },
    // Optional: you can increase interactive transaction timeout,
    // but the code is designed to be fast and should not need it.
    // { timeout: 15000 }
  );

  // Heavy step OUTSIDE tx: attach role-permissions (idempotent, efficient)
  await ensureTenantRolesAndPermissions({
    tenantId: result.tenant.id,
  });

  // Audit log outside tx (safe)
  await writeAuditLog({
    actorUserId: userId,
    actorContext: "TENANT",
    tenantId: result.tenant.id,
    action: "tenant.created",
    targetType: "Tenant",
    targetId: result.tenant.id,
    metadata: {
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
    },
    ipAddress,
    userAgent,
  });

  return result;
}

/**
 * A5: Ensure user has a default workspace; if none, create a DRAFT workspace (to be claimed).
 * Returns the default membership (and tenant) whether existing or newly created.
 * Used by app layout and setup page so first-time users get a DRAFT to claim.
 */
export async function ensureDraftWorkspaceForUser(params: {
  userId: string;
  userEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{
  id: string;
  tenantId: string;
  tenant: { id: string; name: string; slug: string; status: string };
}> {
  const { userId, userEmail, ipAddress, userAgent } = params;

  const existing = await prisma.tenantMembership.findFirst({
    where: { userId, isDefaultTenant: true },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  if (existing) return existing as { id: string; tenantId: string; tenant: { id: string; name: string; slug: string; status: string } };

  const result = await prisma.$transaction(async (tx) => {
    const again = await tx.tenantMembership.findFirst({
      where: { userId, isDefaultTenant: true },
      select: {
        id: true,
        tenantId: true,
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    if (again?.tenant) return again;

    const baseName = (userEmail?.split("@")[0] ?? "workspace").slice(0, 30);
    const slug = await generateUniqueTenantSlug(tx, baseName);

    const tenant = await tx.tenant.create({
      data: {
        name: `${baseName}'s Workspace`,
        slug,
        status: "DRAFT",
        createdByUserId: userId,
      },
      select: { id: true, name: true, slug: true, status: true },
    });

    const membership = await tx.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId,
        status: "ACTIVE",
        joinedAt: new Date(),
        isDefaultTenant: true,
      },
      select: { id: true, tenantId: true },
    });

    const [ownerRole] = await Promise.all([
      tx.tenantRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "Owner" } },
        update: { isSystem: true },
        create: { tenantId: tenant.id, name: "Owner", isSystem: true },
        select: { id: true, name: true },
      }),
      tx.tenantRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "Admin" } },
        update: { isSystem: true },
        create: { tenantId: tenant.id, name: "Admin", isSystem: true },
        select: { id: true },
      }),
      tx.tenantRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "Finance" } },
        update: { isSystem: true },
        create: { tenantId: tenant.id, name: "Finance", isSystem: true },
        select: { id: true },
      }),
      tx.tenantRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "Member" } },
        update: { isSystem: true },
        create: { tenantId: tenant.id, name: "Member", isSystem: true },
        select: { id: true },
      }),
    ]);

    await tx.tenantUserRole.upsert({
      where: {
        membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id },
      },
      update: {},
      create: { membershipId: membership.id, roleId: ownerRole.id },
    });

    return {
      id: membership.id,
      tenantId: membership.tenantId,
      tenant,
    };
  });

  await ensureTenantRolesAndPermissions({ tenantId: result.tenant.id });

  await writeAuditLog({
    actorUserId: userId,
    actorContext: "TENANT",
    tenantId: result.tenant.id,
    action: "workspace.auto_created",
    targetType: "Tenant",
    targetId: result.tenant.id,
    metadata: {
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
    },
    ipAddress,
    userAgent,
  });

  return result;
}

/**
 * A5: Check if a slug is available (case-insensitive). Call with lowercased slug.
 */
export async function isSlugAvailable(slugLower: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Tenant" WHERE LOWER("slug") = ${slugLower} LIMIT 1
  `;
  return rows.length === 0;
}

/**
 * A5: Claim user's DRAFT workspace with a chosen slug. Caller must validate slug (claimSlugSchema + availability).
 */
export async function claimWorkspaceBySlug(params: {
  userId: string;
  slug: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ tenant: { id: string; name: string; slug: string; status: string } }> {
  const { userId, slug, ipAddress, userAgent } = params;

  const slugLower = slug.toLowerCase();
  const available = await isSlugAvailable(slugLower);
  if (!available) throw new SlugTakenError(slug);

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      isDefaultTenant: true,
      status: "ACTIVE",
      tenant: { status: "DRAFT" },
      roles: {
        some: {
          role: { name: "Owner" },
        },
      },
    },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  if (!membership?.tenant) {
    const err = new Error("No DRAFT workspace found for user");
    (err as Error & { code?: string }).code = "NO_DRAFT_WORKSPACE";
    throw err;
  }

  const name = nameFromSlug(slugLower);
  const previousSlug = membership.tenant.slug;

  const tenant = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.update({
      where: { id: membership.tenantId },
      data: {
        slug: slugLower,
        name,
        status: "ACTIVE",
        claimedAt: new Date(),
      },
      select: { id: true, name: true, slug: true, status: true },
    });

    return updated;
  });

  await writeAuditLog({
    actorUserId: userId,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "workspace.claimed",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: {
      previousSlug,
      newSlug: slugLower,
      statusFrom: "DRAFT",
      statusTo: "ACTIVE",
    },
    ipAddress,
    userAgent,
  });

  return { tenant };
}

/**
 * Create a new workspace (tenant) for an authenticated user.
 * A1: single transaction (Tenant + TenantMembership + TenantUserRole + AuditLog).
 * Request provides slug only; name is derived from slug (e.g. acme-inc → Acme Inc).
 */
export async function createTenantForUser(params: {
  userId: string;
  slug: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ tenant: { id: string; name: string; slug: string; status: string } }> {
  const { userId, slug, ipAddress, userAgent } = params;

  const name = nameFromSlug(slug);
  const existingBySlug = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existingBySlug) throw new SlugTakenError(slug);

  await assertWorkspaceNameUniqueForUser(prisma, userId, name);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          status: "ACTIVE",
          createdByUserId: userId,
        },
        select: { id: true, name: true, slug: true, status: true },
      });

      const [ownerRole] = await Promise.all([
        tx.tenantRole.create({
          data: { tenantId: tenant.id, name: "Owner", isSystem: true },
          select: { id: true, name: true },
        }),
        tx.tenantRole.create({
          data: { tenantId: tenant.id, name: "Admin", isSystem: true },
          select: { id: true, name: true },
        }),
        tx.tenantRole.create({
          data: { tenantId: tenant.id, name: "Finance", isSystem: true },
          select: { id: true, name: true },
        }),
        tx.tenantRole.create({
          data: { tenantId: tenant.id, name: "Member", isSystem: true },
          select: { id: true, name: true },
        }),
      ]);

      const hasOtherDefault = (await tx.tenantMembership.count({
        where: { userId, isDefaultTenant: true, status: "ACTIVE" },
      })) > 0;
      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId,
          status: "ACTIVE",
          joinedAt: new Date(),
          isDefaultTenant: !hasOtherDefault,
        },
        select: { id: true },
      });

      await tx.tenantUserRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          actorContext: "TENANT",
          tenantId: tenant.id,
          action: "tenant.created",
          targetType: "Tenant",
          targetId: tenant.id,
          metadata: { tenantName: tenant.name, tenantSlug: tenant.slug },
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return { tenant };
    });

    await ensureTenantRolesAndPermissions({ tenantId: result.tenant.id });

    return result;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002")
      throw new SlugTakenError(slug);
    throw err;
  }
}

/**
 * Ensure the minimal permission mapping exists for tenant roles.
 * Aligned with docs/epics/2-A2-Roles-And-Permissions.md (A2).
 * - Idempotent, fast (batch createMany + minimal reads), NOT inside interactive transaction.
 */
async function ensureTenantRolesAndPermissions(params: { tenantId: string }) {
  const { tenantId } = params;

  // Role -> permission codes (A2 catalog)
  const ROLE_PERMS: Record<"Owner" | "Admin" | "Finance" | "Member", string[]> = {
    Owner: [
      "tenant.audit.read",
      "tenant.billing.manage",
      "tenant.settings.manage",
      "tenant.roles.read",
      "tenant.roles.manage",
      "tenant.users.read",
      "tenant.users.invite",
      "tenant.users.manage",
      "tenant.users.disable",
      "tenant.requests.create",
      "tenant.requests.read_all",
      "tenant.requests.close",
      "tenant.requests.share",
      "tenant.requests.link",
      "tenant.requests.export",
      "tenant.requests.comment",
      "tenant.evidence.add",
      "tenant.approvals.assign_internal",
      "tenant.approvals.assign_external",
      "tenant.approvals.remind",
      "tenant.payments.manage",
    ],
    Admin: [
      "tenant.audit.read",
      "tenant.settings.manage",
      "tenant.roles.read",
      "tenant.roles.manage",
      "tenant.users.read",
      "tenant.users.invite",
      "tenant.users.manage",
      "tenant.users.disable",
      "tenant.requests.create",
      "tenant.requests.read_all",
      "tenant.requests.close",
      "tenant.requests.share",
      "tenant.requests.link",
      "tenant.requests.export",
      "tenant.requests.comment",
      "tenant.evidence.add",
      "tenant.approvals.assign_internal",
      "tenant.approvals.assign_external",
      "tenant.approvals.remind",
      "tenant.payments.manage",
    ],
    Finance: [
      "tenant.audit.read",
      "tenant.requests.create",
      "tenant.requests.read_all",
      "tenant.requests.close",
      "tenant.requests.share",
      "tenant.requests.link",
      "tenant.requests.export",
      "tenant.requests.comment",
      "tenant.evidence.add",
      "tenant.approvals.assign_internal",
      "tenant.approvals.assign_external",
      "tenant.approvals.remind",
      "tenant.payments.manage",
    ],
    Member: [
      "tenant.users.read",
      "tenant.requests.create",
      "tenant.requests.share",
      "tenant.requests.link",
      "tenant.requests.comment",
      "tenant.evidence.add",
    ],
  };

  // 1) Load role ids for this tenant
  const roles = await prisma.tenantRole.findMany({
    where: { tenantId, name: { in: ["Owner", "Admin", "Finance", "Member"] } },
    select: { id: true, name: true },
  });

  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

  // If roles are missing for some reason, do not fail hard; just exit.
  // (In practice, they should exist.)
  if (!roleIdByName.get("Owner")) return;

  // 2) Load permission ids for the codes we need (single query)
  const neededCodes = Array.from(
    new Set(Object.values(ROLE_PERMS).flatMap((arr) => arr))
  );

  const perms = await prisma.permission.findMany({
    where: { code: { in: neededCodes } },
    select: { id: true, code: true },
  });

  const permIdByCode = new Map(perms.map((p) => [p.code, p.id]));

  // 3) Build join rows and insert using createMany + skipDuplicates
  const joinRows: Array<{ roleId: string; permissionId: string }> = [];

  for (const [roleName, codes] of Object.entries(ROLE_PERMS) as Array<
    [keyof typeof ROLE_PERMS, string[]]
  >) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) continue;

    for (const code of codes) {
      const permissionId = permIdByCode.get(code);
      if (!permissionId) continue;
      joinRows.push({ roleId, permissionId });
    }
  }

  if (joinRows.length === 0) return;

  await prisma.tenantRolePermission.createMany({
    data: joinRows,
    skipDuplicates: true, // Prisma will ignore existing composite PKs
  });
}

async function generateUniqueTenantSlug(
  tx: Prisma.TransactionClient,
  base: string
): Promise<string> {
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace";

  for (let i = 0; i < 10; i++) {
    const candidate =
      i === 0 ? clean : `${clean}-${Math.floor(Math.random() * 9999)}`;

    const exists = await tx.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!exists) return candidate;
  }

  return `${clean}-${Date.now()}`;
}
