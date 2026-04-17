import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/server/db";

function normalizeAllowlist() {
  const raw = env.BOOTSTRAP_ADMIN_EMAIL ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True if email is on BOOTSTRAP_ADMIN_EMAIL (comma-separated) allowlist. */
export function isBootstrapAllowlistedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return normalizeAllowlist().includes(email.trim().toLowerCase());
}

export async function ensureBootstrapPlatformOwner(params: {
  userId: string;
  email?: string | null;
}) {
  const { userId, email } = params;
  if (!email) return;

  if (!isBootstrapAllowlistedEmail(email)) return;

  const platformAdminRole = await prisma.vendorRole.findUnique({
    where: { name: "PlatformAdmin" },
    select: { id: true },
  });
  if (!platformAdminRole) return;

  await prisma.vendorUserRole.upsert({
    where: { userId_roleId: { userId, roleId: platformAdminRole.id } },
    update: {},
    create: { userId, roleId: platformAdminRole.id },
  });

  // Optional legacy sync (safe during migration)
  await prisma.user.update({
    where: { id: userId },
    data: { role: "ADMIN" },
  });
}

/**
 * Called after sign-in: if the signed-in user has pending VendorInvitation row(s)
 * matching their email, activate them automatically.
 */
export async function activatePendingVendorInvitation(params: {
  userId: string;
  email?: string | null;
}): Promise<void> {
  const { userId, email } = params;
  if (!email) return;

  const now = new Date();
  const invitations = await prisma.vendorInvitation.findMany({
    where: {
      email: email.trim().toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, roleName: true },
    orderBy: { createdAt: "asc" },
  });
  if (invitations.length === 0) return;

  for (const invitation of invitations) {
    const role = await prisma.vendorRole.findUnique({
      where: { name: invitation.roleName },
      select: { id: true },
    });
    if (!role) continue;

    await prisma.$transaction([
      prisma.vendorUserRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id },
      }),
      prisma.vendorInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: now },
      }),
    ]);
  }
}
