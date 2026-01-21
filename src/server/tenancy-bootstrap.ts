import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import type { Prisma } from "@prisma/client";

/**
 * v1 bootstrap:
 * - If user has no default tenant, create one
 * - Create system roles (Owner/Admin/Member) if missing
 * - Assign Owner role to the creator membership
 */
export async function ensureDefaultTenantForUser(params: {
    userId: string;
    userEmail?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}) {
    const { userId, userEmail, ipAddress, userAgent } = params;

    // Fast path: already has a default tenant
    const existing = await prisma.tenantMembership.findFirst({
        where: { userId, isDefaultTenant: true, status: "ACTIVE" },
        select: {
            id: true,
            tenant: { select: { id: true, name: true, slug: true, status: true } },
        },
    });

    if (existing?.tenant) return existing;

    // Create everything in one transaction
    const result = await prisma.$transaction(async (tx) => {
        // Re-check inside tx (race-safe)
        const again = await tx.tenantMembership.findFirst({
            where: { userId, isDefaultTenant: true, status: "ACTIVE" },
            select: {
                id: true,
                tenant: { select: { id: true, name: true, slug: true, status: true } },
            },
        });
        if (again?.tenant) return again;

        // Create tenant
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

        // Create membership (default tenant)
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

        // Ensure basic tenant roles exist (idempotent)
        const tenantOwnerRole =
            (await tx.tenantRole.findUnique({
                where: { tenantId_name: { tenantId: tenant.id, name: "TenantOwner" } },
                select: { id: true },
            })) ??
            (await tx.tenantRole.create({
                data: { tenantId: tenant.id, name: "TenantOwner", isSystem: true },
                select: { id: true },
            }));

        const tenantAdminRole =
            (await tx.tenantRole.findUnique({
                where: { tenantId_name: { tenantId: tenant.id, name: "TenantAdmin" } },
                select: { id: true },
            })) ??
            (await tx.tenantRole.create({
                data: { tenantId: tenant.id, name: "TenantAdmin", isSystem: true },
                select: { id: true },
            }));

        const viewerRole =
            (await tx.tenantRole.findUnique({
                where: { tenantId_name: { tenantId: tenant.id, name: "Viewer" } },
                select: { id: true },
            })) ??
            (await tx.tenantRole.create({
                data: { tenantId: tenant.id, name: "Viewer", isSystem: true },
                select: { id: true },
            }));

        // Ensure role permissions (minimal for v1)
        const permReadUsers = await tx.permission.findUnique({
            where: { code: "tenant.users.read" },
            select: { id: true },
        });

        if (permReadUsers) {
            // Viewer gets read
            await tx.tenantRolePermission.upsert({
                where: { roleId_permissionId: { roleId: viewerRole.id, permissionId: permReadUsers.id } },
                update: {},
                create: { roleId: viewerRole.id, permissionId: permReadUsers.id },
            });

            // TenantOwner gets read (you can expand later)
            await tx.tenantRolePermission.upsert({
                where: { roleId_permissionId: { roleId: tenantOwnerRole.id, permissionId: permReadUsers.id } },
                update: {},
                create: { roleId: tenantOwnerRole.id, permissionId: permReadUsers.id },
            });

            // TenantAdmin gets read
            await tx.tenantRolePermission.upsert({
                where: { roleId_permissionId: { roleId: tenantAdminRole.id, permissionId: permReadUsers.id } },
                update: {},
                create: { roleId: tenantAdminRole.id, permissionId: permReadUsers.id },
            });
        }


        // Assign TenantOwner to the bootstrap user (first user in tenant)
        await tx.tenantUserRole.upsert({
            where: {
                membershipId_roleId: { membershipId: membership.id, roleId: tenantOwnerRole.id },
            },
            update: {},
            create: { membershipId: membership.id, roleId: tenantOwnerRole.id },
        });

        // Ensure system roles exist
        const roleNames = ["Owner", "Admin", "Member"] as const;

        const roles = await Promise.all(
            roleNames.map(async (name) => {
                const existingRole = await tx.tenantRole.findUnique({
                    where: { tenantId_name: { tenantId: tenant.id, name } },
                    select: { id: true },
                });

                if (existingRole) return { name, id: existingRole.id };

                const created = await tx.tenantRole.create({
                    data: {
                        tenantId: tenant.id,
                        name,
                        isSystem: true,
                    },
                    select: { id: true },
                });

                return { name, id: created.id };
            })
        );

        // Assign Owner role to the creator
        const ownerRoleId = roles.find((r) => r.name === "Owner")!.id;

        await tx.tenantUserRole.create({
            data: { membershipId: membership.id, roleId: ownerRoleId },
        });

        return {
            id: membership.id,
            tenant,
        };
    });

    await writeAuditLog({
        actorUserId: userId,
        actorContext: "TENANT",
        tenantId: result.tenant.id,
        action: "tenant.bootstrap.created",
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
