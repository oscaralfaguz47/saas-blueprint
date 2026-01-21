const { PrismaClient, RoleKey } = require("@prisma/client");

const prisma = new PrismaClient();

// Minimal, stable permission catalog to start.
// You can extend later without breaking anything.
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
    name: "PlatformOwner",
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
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description, scope: p.scope },
      create: { code: p.code, description: p.description, scope: p.scope },
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

    // Connect permissions (idempotent via upsert on join table)
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
  // Minimal plan for gating later (can be expanded later)
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

async function bootstrapAdminUser() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;

  if (!adminEmail) {
    console.log("BOOTSTRAP_ADMIN_EMAIL is not set. Skipping bootstrap admin.");
    return null;
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: RoleKey.ADMIN },
    create: { email: adminEmail, role: RoleKey.ADMIN, name: "Bootstrap Admin" },
  });

  // Ensure UserSecurity exists (idempotent)
  await prisma.userSecurity.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  console.log(`Seeded admin user: ${adminEmail}`);
  return admin;
}

async function assignVendorRoleToBootstrapAdmin(adminUser) {
  if (!adminUser) return;

  // Map legacy ADMIN -> PlatformOwner
  const platformOwner = await prisma.vendorRole.findUnique({
    where: { name: "PlatformOwner" },
  });

  if (!platformOwner) return;

  await prisma.vendorUserRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: platformOwner.id } },
    update: {},
    create: { userId: adminUser.id, roleId: platformOwner.id },
  });

  console.log(`Assigned VendorRole PlatformOwner to ${adminUser.email}`);
}

async function main() {
  // 1) Permissions
  await ensurePermissions();

  // 2) Vendor roles
  await ensureVendorRoles();

  // 3) Plan base
  await ensurePlan();

  // 4) Bootstrap admin (legacy role preserved)
  const admin = await bootstrapAdminUser();

  // 5) Map bootstrap admin to vendor role
  await assignVendorRoleToBootstrapAdmin(admin);
  await ensureBootstrapTenantAndMembership(admin);

  console.log("Seed completed.");
}

async function ensureTenantRoles(tenantId) {
  // Create basic tenant roles
  const roles = ["Owner", "Admin", "Member"];

  const created = {};
  for (const name of roles) {
    created[name] = await prisma.tenantRole.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: { isSystem: true },
      create: { tenantId, name, isSystem: true },
    });
  }

  // Map permissions to roles (minimal set)
const rolePerms = {
  Owner: [
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.manage",
    "tenant.roles.manage",
    "tenant.settings.manage",
    "tenant.audit.read",
    "tenant.billing.manage",
  ],
  Admin: [
    "tenant.users.read",
    "tenant.users.invite",
    "tenant.users.manage",
    "tenant.settings.manage",
    "tenant.audit.read",
  ],
  Member: ["tenant.users.read"],
};

  for (const [roleName, permCodes] of Object.entries(rolePerms)) {
    const role = created[roleName];
    for (const code of permCodes) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;

      await prisma.tenantRolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  return created;
}

async function ensureBootstrapTenantAndMembership(adminUser) {
  if (!adminUser) return null;

  const tenant = await prisma.tenant.upsert({
    where: { slug: "bootstrap" },
    update: {},
    create: {
      name: "Bootstrap Tenant",
      slug: "bootstrap",
      status: "ACTIVE",
    },
  });

  const membership = await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: adminUser.id } },
    update: { status: "ACTIVE", isDefaultTenant: true },
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      status: "ACTIVE",
      joinedAt: new Date(),
      isDefaultTenant: true,
    },
  });

  const roles = await ensureTenantRoles(tenant.id);

  // Assign TenantOwner to bootstrap admin
  await prisma.tenantUserRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: roles.Owner.id } },
    update: {},
    create: { membershipId: membership.id, roleId: roles.Owner.id },
  });

  // Create a base subscription for the tenant (trial)
  const plan = await prisma.plan.findUnique({ where: { code: "base" } });
  if (plan) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "TRIAL",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        provider: "manual",
      },
    }).catch(() => {
      // ignore duplicates if you later enforce unique constraints, etc.
    });
  }

  console.log(`Seeded default tenant + membership for ${adminUser.email}`);
  return { tenant, membership };
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
