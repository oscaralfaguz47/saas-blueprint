import "server-only";

import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { slugFromTenantName } from "@/lib/validations";
import type { Prisma } from "@prisma/client";

/** Thrown when create-tenant fails because the slug is already in use. No retries. */
export class SlugTakenError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`A workspace with the URL "${slug}" already exists. Please choose a different name.`);
    this.name = "SlugTakenError";
    this.slug = slug;
  }
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

  // Fast path: already has a default active tenant
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
 * Create a new workspace (tenant) for an authenticated user.
 * A1: single transaction (Tenant + TenantMembership + TenantUserRole + AuditLog).
 * Slug is derived from name; on collision throws SlugTakenError (no retries).
 */
export async function createTenantForUser(params: {
  userId: string;
  name: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ tenant: { id: string; name: string; slug: string; status: string } }> {
  const { userId, name, ipAddress, userAgent } = params;

  const slug = slugFromTenantName(name);
  const existing = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) throw new SlugTakenError(slug);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: name.trim(),
          slug,
          status: "ACTIVE",
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

      // Newly created workspace becomes the active one: clear other defaults, then set this as default
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
