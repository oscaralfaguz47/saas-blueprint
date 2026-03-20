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
 * - Ensure system tenant roles exist: Primary Owner, Owner, Admin, Finance, Member (A2)
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

      // Ensure system roles exist (idempotent). A2: Primary Owner, Owner, Admin, Finance, Member.
      const [primaryOwnerRole] = await Promise.all([
        tx.tenantRole.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: "Primary Owner" } },
          update: { isSystem: true },
          create: { tenantId: tenant.id, name: "Primary Owner", isSystem: true },
          select: { id: true, name: true },
        }),
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

      // Assign Primary Owner role to the creator (exactly one per workspace, A2)
      await tx.tenantUserRole.upsert({
        where: {
          membershipId_roleId: { membershipId: membership.id, roleId: primaryOwnerRole.id },
        },
        update: {},
        create: { membershipId: membership.id, roleId: primaryOwnerRole.id },
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
 * A5: Ensure user has a default workspace; if none (or only disabled), create a DRAFT workspace (to be claimed).
 * Returns the default membership (and tenant) whether existing or newly created.
 * Only ACTIVE memberships count as "existing"; if the user's only default is DISABLED (e.g. disabled from invited workspace), we create a new DRAFT.
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

  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!userExists) {
    const err = new Error("User not found (e.g. session stale after DB reset). Sign in again.");
    (err as Error & { code?: string }).code = "USER_NOT_FOUND";
    throw err;
  }

  // Reuse existing default (ACTIVE or DRAFT).
  const existing = await prisma.tenantMembership.findFirst({
    where: { userId, isDefaultTenant: true, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
  if (existing?.tenant) return existing as { id: string; tenantId: string; tenant: { id: string; name: string; slug: string; status: string } };

  // Reuse any existing DRAFT membership for this user (only one DRAFT per user).
  const existingDraft = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      tenant: { status: "DRAFT" },
    },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  if (existingDraft?.tenant) {
    await prisma.tenantMembership.updateMany({
      where: { userId },
      data: { isDefaultTenant: false },
    });
    await prisma.tenantMembership.update({
      where: { id: existingDraft.id },
      data: { isDefaultTenant: true },
    });
    return existingDraft as { id: string; tenantId: string; tenant: { id: string; name: string; slug: string; status: string } };
  }

  const result = await prisma.$transaction(async (tx) => {
    const again = await tx.tenantMembership.findFirst({
      where: { userId, status: "ACTIVE", tenant: { status: "DRAFT" } },
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
        name: nameFromSlug(slug),
        slug,
        status: "ACTIVE",
        claimedAt: new Date(),
        createdByUserId: userId,
      },
      select: { id: true, name: true, slug: true, status: true },
    });

    await tx.tenantMembership.updateMany({
      where: { userId },
      data: { isDefaultTenant: false },
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

    const [primaryOwnerRole] = await Promise.all([
      tx.tenantRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "Primary Owner" } },
        update: { isSystem: true },
        create: { tenantId: tenant.id, name: "Primary Owner", isSystem: true },
        select: { id: true, name: true },
      }),
      tx.tenantRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "Owner" } },
        update: { isSystem: true },
        create: { tenantId: tenant.id, name: "Owner", isSystem: true },
        select: { id: true },
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
        membershipId_roleId: { membershipId: membership.id, roleId: primaryOwnerRole.id },
      },
      update: {},
      create: { membershipId: membership.id, roleId: primaryOwnerRole.id },
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
    action: "workspace.created",
    targetType: "Tenant",
    targetId: result.tenant.id,
    metadata: {
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
      method: "auto",
    },
    ipAddress,
    userAgent,
  });

  return result;
}

/**
 * A5: Delete all DRAFT tenants created by this user (e.g. after they accept an invite).
 * Ensures only one logical "draft" per user and cleans up when they join another workspace.
 */
export async function deleteUserDraftTenants(params: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ deletedCount: number }> {
  const { userId, ipAddress, userAgent } = params;

  const drafts = await prisma.tenant.findMany({
    where: { status: "DRAFT", createdByUserId: userId },
    select: { id: true, name: true, slug: true },
  });

  for (const tenant of drafts) {
    await writeAuditLog({
      actorUserId: userId,
      actorContext: "TENANT",
      tenantId: tenant.id,
      action: "workspace.draft_deleted",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: { tenantName: tenant.name, tenantSlug: tenant.slug, reason: "user_accepted_invite" },
      ipAddress,
      userAgent,
    });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }

  return { deletedCount: drafts.length };
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

      const [primaryOwnerRole] = await Promise.all([
        tx.tenantRole.create({
          data: { tenantId: tenant.id, name: "Primary Owner", isSystem: true },
          select: { id: true, name: true },
        }),
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
        data: { membershipId: membership.id, roleId: primaryOwnerRole.id },
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

import { ensureTenantRolesAndPermissionsWithPrisma } from "@/lib/tenant-role-permissions";

/**
 * Ensure the minimal permission mapping exists for tenant roles (A2).
 * Idempotent; uses shared ROLE_PERMS from @/lib/tenant-role-permissions.
 */
export async function ensureTenantRolesAndPermissions(params: { tenantId: string }) {
  await ensureTenantRolesAndPermissionsWithPrisma(prisma, params);
}

/**
 * One-off sync: ensure all existing tenants have role-permission links per A2.
 * Run after updating ROLE_PERMS (e.g. Finance permissions). Idempotent.
 */
export async function syncAllTenantRolePermissions(): Promise<{ synced: number }> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true },
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
  });
  for (const t of tenants) {
    await ensureTenantRolesAndPermissions({ tenantId: t.id });
  }
  return { synced: tenants.length };
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
