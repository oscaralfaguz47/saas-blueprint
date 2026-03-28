/**
 * Production-safe, idempotent seed for system data only:
 * - Permission catalog
 * - Vendor roles + exact role-permission links (add missing, remove extra)
 * - Plans with featuresJson
 *
 * STRICT MODE: Set STRICT_SEED=false to allow non-fatal warnings; default is true (fail on any inconsistency).
 * Exit: 0 on success, 1 on error. prisma.$disconnect in finally.
 */
const { PrismaClient, PermissionScope } = require("@prisma/client");
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// STRICT MODE: true = throw on any inconsistency; false = warn and continue best-effort
// Default true when STRICT_SEED is unset (CI/Preview safe). Set STRICT_SEED=false to allow warnings.
// ---------------------------------------------------------------------------
function isTruthyEnv(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const STRICT = process.env.STRICT_SEED === undefined ? true : isTruthyEnv(process.env.STRICT_SEED);

function assertOrWarn(condition, message, strictMessage) {
  if (condition) return;
  if (STRICT) {
    throw new Error(strictMessage != null ? strictMessage : message);
  }
  console.warn("[seed] " + message);
}

const VALID_SCOPES = new Set(["TENANT", "VENDOR", "BOTH"]);

/** Parse scope string to PermissionScope enum. Returns null if invalid (no fallback to BOTH). */
function parseScope(scope) {
  if (typeof scope !== "string" || !VALID_SCOPES.has(scope.trim())) return null;
  const s = scope.trim();
  if (s === "TENANT") return PermissionScope.TENANT;
  if (s === "VENDOR") return PermissionScope.VENDOR;
  if (s === "BOTH") return PermissionScope.BOTH;
  return null;
}

// ---------------------------------------------------------------------------
// PERMISSION CATALOG (aligned with docs/epics/2-A2-Roles-And-Permissions.md and 00-NAMING-AND-PERMISSION-ALIGNMENT.md)
// ---------------------------------------------------------------------------
const PERMISSIONS = [
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
  { code: "admin.tenants.read", scope: "VENDOR", description: "Read tenants (vendor)" },
  { code: "admin.tenants.suspend", scope: "VENDOR", description: "Suspend/reactivate tenants (vendor)" },
  { code: "admin.users.read", scope: "VENDOR", description: "Read users (vendor)" },
  {
    code: "admin.users.manage",
    scope: "VENDOR",
    description: "Manage workspace members (roles, status) via platform admin (vendor)",
  },
  { code: "admin.users.block", scope: "VENDOR", description: "Block/unblock users (vendor)" },
  { code: "admin.sessions.revoke", scope: "VENDOR", description: "Force logout users (vendor)" },
  { code: "admin.mfa.reset", scope: "VENDOR", description: "Reset MFA (vendor)" },
  { code: "admin.billing.read", scope: "VENDOR", description: "Read billing/subscriptions (vendor)" },
  { code: "admin.audit.read", scope: "VENDOR", description: "Read platform audit logs (vendor)" },
  { code: "admin.support.read", scope: "VENDOR", description: "View support tickets across workspaces (vendor)" },
  { code: "admin.support.reply", scope: "VENDOR", description: "Post public replies on support tickets (vendor)" },
  { code: "admin.support.manage", scope: "VENDOR", description: "Manage support tickets (assign, status, internal notes) (vendor)" },
  { code: "admin.knowledge_base.read", scope: "VENDOR", description: "View Knowledge Base CMS (vendor)" },
  { code: "admin.knowledge_base.manage", scope: "VENDOR", description: "Manage Knowledge Base content (vendor)" },
  { code: "support.ticket.create", scope: "TENANT", description: "Create support tickets" },
  { code: "support.ticket.read_own", scope: "TENANT", description: "Read own support tickets" },
  { code: "support.ticket.read_workspace", scope: "TENANT", description: "Read all workspace support tickets" },
  { code: "support.ticket.reply_own", scope: "TENANT", description: "Reply on own support tickets" },
  { code: "support.ticket.reply_workspace", scope: "TENANT", description: "Reply on any workspace support ticket" },
];

const VENDOR_ROLES = [
  {
    name: "PlatformAdmin",
    permissions: [
      "admin.tenants.read", "admin.tenants.suspend", "admin.users.read", "admin.users.manage",
      "admin.users.block",
      "admin.sessions.revoke", "admin.mfa.reset", "admin.billing.read", "admin.audit.read",
      "admin.support.read", "admin.support.reply", "admin.support.manage",
      "admin.knowledge_base.read", "admin.knowledge_base.manage",
    ],
  },
  {
    name: "SupportAdmin",
    permissions: [
      "admin.tenants.read", "admin.users.read", "admin.sessions.revoke", "admin.mfa.reset", "admin.audit.read",
      "admin.support.read", "admin.support.reply", "admin.support.manage",
      "admin.knowledge_base.read",
    ],
  },
  { name: "BillingOps", permissions: ["admin.tenants.read", "admin.billing.read", "admin.audit.read"] },
  {
    name: "ReadOnlySupport",
    permissions: [
      "admin.tenants.read", "admin.users.read", "admin.audit.read",
      "admin.support.read", "admin.knowledge_base.read",
    ],
  },
];

// ---------------------------------------------------------------------------
// VALIDATION: PERMISSIONS entries (code, scope, description). No silent scope fallback.
// ---------------------------------------------------------------------------
function validatePermissions() {
  const errors = [];
  for (let i = 0; i < PERMISSIONS.length; i++) {
    const p = PERMISSIONS[i];
    if (typeof p.code !== "string" || !p.code.trim()) {
      errors.push(`PERMISSIONS[${i}]: code must be a non-empty string.`);
      continue;
    }
    if (typeof p.description !== "string" || !p.description.trim()) {
      errors.push(`PERMISSIONS[${i}] (code=${p.code}): description must be non-empty.`);
    }
    const scopeEnum = parseScope(p.scope);
    if (scopeEnum === null) {
      errors.push(
        `PERMISSIONS[${i}] (code=${p.code}): scope must be exactly one of "TENANT", "VENDOR", "BOTH". Got: ${JSON.stringify(p.scope)}. Fix PERMISSIONS array.`
      );
    }
  }
  if (errors.length > 0) {
    if (STRICT) throw new Error("Permission validation failed:\n" + errors.join("\n"));
    errors.forEach((e) => console.warn("[seed] " + e));
  }
}

// ---------------------------------------------------------------------------
// B) PERMISSION UPSERTS (catalog) — idempotent, one transaction, optional create/update counts
// ---------------------------------------------------------------------------
async function ensurePermissions() {
  validatePermissions();

  const existingByCode = await prisma.permission.findMany({
    where: { code: { in: PERMISSIONS.map((p) => p.code.trim()) } },
    select: { code: true },
  });
  const existingSet = new Set(existingByCode.map((r) => r.code));

  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const p of PERMISSIONS) {
      const code = p.code.trim();
      const scopeEnum = parseScope(p.scope);
      if (scopeEnum === null) {
        assertOrWarn(
          false,
          `Skipping permission ${code}: invalid scope. Fix PERMISSIONS scope to one of TENANT, VENDOR, BOTH.`,
          `Invalid scope for permission ${code}. Fix PERMISSIONS array: scope must be "TENANT", "VENDOR", or "BOTH".`
        );
        continue;
      }
      const existed = existingSet.has(code);
      await tx.permission.upsert({
        where: { code },
        update: { description: p.description.trim(), scope: scopeEnum },
        create: { code, description: p.description.trim(), scope: scopeEnum },
      });
      if (existed) updated++; else created++;
    }
  });

  console.log(`[seed] Permissions: ${PERMISSIONS.length} processed (${created} created, ${updated} updated).`);
  return { processed: PERMISSIONS.length, created, updated };
}

// ---------------------------------------------------------------------------
// C) PRELOAD PERMISSIONS: single query for all codes needed by VENDOR_ROLES → Map(code -> permissionId)
// ---------------------------------------------------------------------------
function collectNeededPermissionCodes() {
  const set = new Set();
  for (const r of VENDOR_ROLES) {
    if (Array.isArray(r.permissions)) {
      r.permissions.forEach((c) => set.add(String(c).trim()));
    }
  }
  return [...set];
}

async function preloadPermissionIdsByCode(codes) {
  if (codes.length === 0) return new Map();
  const list = await prisma.permission.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const map = new Map();
  list.forEach((p) => map.set(p.code, p.id));
  return map;
}

// ---------------------------------------------------------------------------
// D) VENDOR ROLES: upsert by name, then EXACT permission sync (add missing links, remove extra)
// ---------------------------------------------------------------------------
async function ensureVendorRoles() {
  const neededCodes = collectNeededPermissionCodes();
  const codeToId = await preloadPermissionIdsByCode(neededCodes);

  const missingCodes = neededCodes.filter((c) => !codeToId.has(c));
  if (missingCodes.length > 0) {
    const msg = `Missing permission codes in catalog: ${missingCodes.join(", ")}. Add these to PERMISSIONS or remove from VENDOR_ROLES.`;
    if (STRICT) throw new Error(msg);
    console.warn("[seed] " + msg + " Skipping linking those codes.");
  }

  let totalLinksAdded = 0;
  let totalLinksRemoved = 0;

  await prisma.$transaction(async (tx) => {
    for (const r of VENDOR_ROLES) {
      const role = await tx.vendorRole.upsert({
        where: { name: r.name },
        update: { isSystem: true },
        create: { name: r.name, isSystem: true },
      });

      const desiredCodes = (r.permissions || []).map((c) => String(c).trim()).filter(Boolean);
      const desiredPermissionIds = new Set(
        desiredCodes.map((c) => codeToId.get(c)).filter(Boolean)
      );

      const current = await tx.vendorRolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const currentPermissionIds = new Set(current.map((row) => row.permissionId));

      const toAdd = [...desiredPermissionIds].filter((id) => !currentPermissionIds.has(id));
      const toRemove = [...currentPermissionIds].filter((id) => !desiredPermissionIds.has(id));

      if (toAdd.length > 0) {
        await tx.vendorRolePermission.createMany({
          data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
        totalLinksAdded += toAdd.length;
      }
      if (toRemove.length > 0) {
        await tx.vendorRolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { in: toRemove } },
        });
        totalLinksRemoved += toRemove.length;
      }
    }
  });

  console.log(`[seed] Vendor roles: ${VENDOR_ROLES.length} synced. Links added: ${totalLinksAdded}, removed: ${totalLinksRemoved}.`);
  return { roles: VENDOR_ROLES.length, linksAdded: totalLinksAdded, linksRemoved: totalLinksRemoved };
}

// ---------------------------------------------------------------------------
// PLAN HELPERS: minimal validation (featuresJson object, priceMonthly integer cents). -1 = unlimited.
// ---------------------------------------------------------------------------
function validatePlanFeatures(featuresJson, planCode) {
  if (featuresJson !== null && typeof featuresJson === "object" && !Array.isArray(featuresJson)) return true;
  assertOrWarn(
    false,
    `Plan ${planCode}: featuresJson must be an object.`,
    `Plan ${planCode}: featuresJson must be a plain object. Fix PLANS/ensurePlan.`
  );
  return false;
}

function validatePriceMonthly(value, planCode) {
  if (value === undefined || value === null) return true;
  if (Number.isInteger(value)) return true;
  assertOrWarn(
    false,
    `Plan ${planCode}: priceMonthly must be integer (cents) if present.`,
    `Plan ${planCode}: priceMonthly must be integer cents. Fix PLANS.`
  );
  return false;
}

// ---------------------------------------------------------------------------
// F) PLANS: idempotent upsert by code; update name, isActive, priceMonthly, featuresJson
// featuresJson: -1 for included means unlimited; hardCap consistent with limits.
// ---------------------------------------------------------------------------
async function ensurePlans() {
  const plans = [
    {
      code: "base",
      name: "Base",
      isActive: true,
      priceMonthly: null,
      featuresJson: { seatsLimit: 5 },
    },
    {
      code: "free",
      name: "Free",
      isActive: true,
      priceMonthly: 0,
      featuresJson: {
        requests: {
          included: 10,
          hardCap: true,
          rolloverMonths: 0,
          maxAvailable: 10,
          overageCentsPerUnit: null,
          overageCapCents: null,
        },
        pdf: { included: 1, hardCap: true, watermark: true },
        zip: { enabled: false },
        search: false,
        manualReminders: false,
        paymentStatus: false,
        auditLog: "basic",
      },
    },
    {
      code: "starter",
      name: "Starter",
      isActive: true,
      priceMonthly: 5900,
      featuresJson: {
        requests: {
          included: 200,
          hardCap: false,
          rolloverMonths: 2,
          maxAvailable: 400,
          overageCentsPerUnit: 25,
          overageCapCents: 7900,
        },
        pdf: { included: 50, hardCap: true, watermark: false },
        zip: { enabled: false },
        search: true,
        manualReminders: true,
        paymentStatus: true,
        auditLog: 90,
      },
    },
    {
      code: "pro",
      name: "Pro",
      isActive: true,
      priceMonthly: 19900,
      featuresJson: {
        requests: {
          included: 2000,
          hardCap: false,
          rolloverMonths: 1,
          maxAvailable: 4000,
          overageCentsPerUnit: 5,
          overageCapCents: null,
        },
        // included: -1 means unlimited (no hard cap on count)
        pdf: { included: -1, hardCap: false, watermark: false },
        zip: { enabled: true },
        search: true,
        manualReminders: true,
        paymentStatus: true,
        auditLog: "full",
      },
    },
    {
      code: "enterprise",
      name: "Enterprise",
      isActive: true,
      priceMonthly: 49900,
      featuresJson: {
        requests: {
          included: 4000,
          hardCap: true,
          rolloverMonths: 0,
          maxAvailable: 4000,
          overageCentsPerUnit: null,
          overageCapCents: null,
        },
        // included: -1 means unlimited
        pdf: { included: -1, hardCap: false, watermark: false },
        zip: { enabled: true },
        search: true,
        manualReminders: true,
        paymentStatus: true,
        auditLog: "full",
      },
    },
  ];

  for (const pl of plans) {
    validatePlanFeatures(pl.featuresJson, pl.code);
    validatePriceMonthly(pl.priceMonthly, pl.code);
  }

  await prisma.$transaction(async (tx) => {
    for (const pl of plans) {
      await tx.plan.upsert({
        where: { code: pl.code },
        update: {
          name: pl.name,
          isActive: pl.isActive,
          priceMonthly: pl.priceMonthly,
          featuresJson: pl.featuresJson,
        },
        create: {
          code: pl.code,
          name: pl.name,
          isActive: pl.isActive,
          priceMonthly: pl.priceMonthly,
          featuresJson: pl.featuresJson,
        },
      });
    }
  });

  console.log(`[seed] Plans: ${plans.length} upserted (base, free, starter, pro, enterprise).`);
  return { count: plans.length };
}

// ---------------------------------------------------------------------------
// MAIN: run steps, summary, exit 0/1
// ---------------------------------------------------------------------------
async function main() {
  console.log("[seed] STRICT_SEED=" + (STRICT ? "true" : "false") + ". System data only (permissions, vendor roles, plans).");

  const permStats = await ensurePermissions();
  const roleStats = await ensureVendorRoles();
  const planStats = await ensurePlans();

  console.log("[seed] Summary: permissions=" + permStats.processed + ", vendor roles=" + roleStats.roles + ", links added=" + roleStats.linksAdded + ", links removed=" + roleStats.linksRemoved + ", plans=" + planStats.count + ".");
  console.log("[seed] Done. Next: first login can bootstrap PlatformAdmin via auth events.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
