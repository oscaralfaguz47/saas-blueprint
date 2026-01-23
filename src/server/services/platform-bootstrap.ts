import "server-only";

import { prisma } from "@/server/db";

function normalizeAllowlist() {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function ensureBootstrapPlatformOwner(params: {
  userId: string;
  email?: string | null;
}) {
  const { userId, email } = params;
  if (!email) return;

  const allowlist = normalizeAllowlist();
  if (!allowlist.includes(email.toLowerCase())) return;

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
