const { PrismaClient, PermissionScope } = require("@prisma/client");
const prisma = new PrismaClient();

// Minimal, stable permission catalog to start.
const PERMISSIONS = [
  // Tenant scope
  { code: "tenant.users.read", scope: "TENANT", description: "Read tenant users" },
  { code: "tenant.users.invite", scope: "TENANT", description: "Invite users to tenant" },
  { code: "tenant.users.manage", scope: "TENANT", description: "Manage tenant users" },
  { code: "tenant.roles.manage", scope: "TENANT", description: "Manage tenant roles and permissions" },
  { code: "tenant.settings.manage", scope: "TENANT", description: "Manage tenant settings" },
  { code: "tenant.audit.read", scope: "TENANT", description: "Read tenant audit logs" },
  { code: "tenant.billing.manage", scope: "TENANT", description: "Manage billing for tenant" },

  // Vendor scope
  { code: "admin.tenants.read", scope: "VENDOR", description: "Read tenants (vendor)" },
  { code: "admin.tenants.suspend", scope: "VENDOR", description: "Suspend/reactivate tenants (vendor)" },
  { code: "admin.users.read", scope: "VENDOR", description: "Read users (vendor)" },
  { code: "admin.users.block", scope: "VENDOR", description: "Block/unblock users (vendor)" },
  { code: "admin.sessions.revoke", scope: "VENDOR", description: "Force logout users (vendor)" },
  { code: "admin.mfa.reset", scope: "VENDOR", description: "Reset MFA (vendor)" },
  { code: "admin.billing.read", scope: "VENDOR", description: "Read billing/subscriptions (vendor)" },
  { code: "admin.audit.read", scope: "VENDOR", description: "Read platform audit logs (vendor)" },
];

const VENDOR_ROLES = [
  {
    name: "PlatformAdmin",
    permissions: [
      "admin.tenants.read",
      "admin.tenants.suspend",
      "admin.users.read",
      "admin.users.block",
      "admin.sessions.revoke",
      "admin.mfa.reset",
      "admin.billing.read",
      "admin.audit.read",
    ],
  },
  {
    name: "SupportAdmin",
    permissions: [
      "admin.tenants.read",
      "admin.users.read",
      "admin.sessions.revoke",
      "admin.mfa.reset",
      "admin.audit.read",
    ],
  },
  {
    name: "BillingOps",
    permissions: ["admin.tenants.read", "admin.billing.read", "admin.audit.read"],
  },
  {
    name: "ReadOnlySupport",
    permissions: ["admin.tenants.read", "admin.users.read", "admin.audit.read"],
  },
];

async function ensurePermissions() {
  for (const p of PERMISSIONS) {
    const scopeEnum =
      p.scope === "TENANT"
        ? PermissionScope.TENANT
        : p.scope === "VENDOR"
        ? PermissionScope.VENDOR
        : PermissionScope.BOTH;

    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description, scope: scopeEnum },
      create: { code: p.code, description: p.description, scope: scopeEnum },
    });
  }
}

async function ensureVendorRoles() {
  for (const r of VENDOR_ROLES) {
    const role = await prisma.vendorRole.upsert({
      where: { name: r.name },
      update: { isSystem: true },
      create: { name: r.name, isSystem: true },
    });

    for (const permCode of r.permissions) {
      const perm = await prisma.permission.findUnique({ where: { code: permCode } });
      if (!perm) continue;

      await prisma.vendorRolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
}

async function ensurePlan() {
  await prisma.plan.upsert({
    where: { code: "base" },
    update: { name: "Base", isActive: true },
    create: {
      code: "base",
      name: "Base",
      isActive: true,
      featuresJson: { seatsLimit: 5 },
    },
  });
}

async function main() {
  await ensurePermissions();
  await ensureVendorRoles();
  await ensurePlan();

  console.log("Seed completed (system data only).");
  console.log("Next step: first login will bootstrap PlatformAdmin assignment via auth events.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
