const { PrismaClient, PermissionScope } = require("@prisma/client");
const prisma = new PrismaClient();

// Permission catalog aligned with docs/epics/2-A2-Roles-And-Permissions.md and 00-NAMING-AND-PERMISSION-ALIGNMENT.md.
const PERMISSIONS = [
  // Tenant scope (A2 catalog)
  { code: "tenant.audit.read", scope: "TENANT", description: "View audit logs (AuditLog)" },
  { code: "tenant.billing.manage", scope: "TENANT", description: "Manage billing, plans, subscriptions" },
  { code: "tenant.settings.manage", scope: "TENANT", description: "Manage workspace settings" },
  { code: "tenant.roles.read", scope: "TENANT", description: "View roles and permissions" },
  { code: "tenant.roles.manage", scope: "TENANT", description: "Create/edit roles and assign permissions" },
  { code: "tenant.users.read", scope: "TENANT", description: "View workspace users" },
  { code: "tenant.users.invite", scope: "TENANT", description: "Invite users to workspace" },
  { code: "tenant.users.manage", scope: "TENANT", description: "Edit/activate/deactivate members" },
  { code: "tenant.users.disable", scope: "TENANT", description: "Disable users (explicit action)" },
  { code: "tenant.requests.create", scope: "TENANT", description: "Create requests" },
  { code: "tenant.requests.read_all", scope: "TENANT", description: "View all tenant requests (bypass access rules)" },
  { code: "tenant.requests.close", scope: "TENANT", description: "Close requests (OPEN → CLOSED)" },
  { code: "tenant.requests.share", scope: "TENANT", description: "Share request (create viewer access)" },
  { code: "tenant.requests.link", scope: "TENANT", description: "Link requests (G1 / G2)" },
  { code: "tenant.requests.export", scope: "TENANT", description: "Export request packet (PDF) and/or bundle (ZIP)" },
  { code: "tenant.requests.comment", scope: "TENANT", description: "Add comments on requests" },
  { code: "tenant.evidence.add", scope: "TENANT", description: "Attach evidence (files and links)" },
  { code: "tenant.approvals.assign_internal", scope: "TENANT", description: "Assign internal approvers" },
  { code: "tenant.approvals.assign_external", scope: "TENANT", description: "Send external approvals via email/token" },
  { code: "tenant.approvals.remind", scope: "TENANT", description: "Send manual reminders to pending approvers" },
  { code: "tenant.payments.manage", scope: "TENANT", description: "Set payment status and manage payment evidence" },

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
