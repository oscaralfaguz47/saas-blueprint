import "server-only";

import { prisma } from "@/server/db";

const STARTER_DEPARTMENTS = [
  { name: "Finance", code: "FIN" },
  { name: "Operations", code: "OPS" },
  { name: "Sales", code: "SAL" },
  { name: "Marketing", code: "MKT" },
  { name: "HR", code: "HR" },
  { name: "IT", code: "IT" },
] as const;

const STARTER_COST_CENTERS = [
  { deptCode: "FIN", code: "FIN-100", name: "Finance General" },
  { deptCode: "OPS", code: "OPS-100", name: "Operations General" },
  { deptCode: "SAL", code: "SAL-100", name: "Sales General" },
  { deptCode: "MKT", code: "MKT-100", name: "Marketing General" },
  { deptCode: "HR", code: "HR-100", name: "HR General" },
  { deptCode: "IT", code: "IT-100", name: "IT General" },
] as const;

/**
 * Seeds starter departments and cost centers for a new workspace.
 * Idempotent — safe to call multiple times (uses upsert by unique keys).
 * Does not require a createdByUserId — system-seeded records have null.
 */
export async function seedFinancialConfigForTenant(tenantId: string): Promise<void> {
  const deptMap = new Map<string, string>();

  for (const dept of STARTER_DEPARTMENTS) {
    const record = await prisma.tenantDepartment.upsert({
      where: { tenantId_name: { tenantId, name: dept.name } },
      update: {},
      create: {
        tenantId,
        name: dept.name,
        code: dept.code,
        isActive: true,
      },
      select: { id: true, code: true },
    });
    if (record.code) deptMap.set(record.code, record.id);
  }

  for (const cc of STARTER_COST_CENTERS) {
    const departmentId = deptMap.get(cc.deptCode);
    if (!departmentId) continue;

    await prisma.tenantCostCenter.upsert({
      where: { tenantId_code: { tenantId, code: cc.code } },
      update: {},
      create: {
        tenantId,
        departmentId,
        code: cc.code,
        name: cc.name,
        isActive: true,
      },
    });
  }
}
