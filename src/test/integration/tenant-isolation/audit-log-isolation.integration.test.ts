import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../_harness/auth-helpers-mocks";
import {
  applyMigrations,
  createTestPrismaClient,
  disconnectTestPrismaClient,
  resetDb,
  seedTwoTenants,
  startPostgresContainer,
  stopPostgresContainer,
} from "../_harness";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { PrismaClient } from "@prisma/client";

describe("tenant isolation — audit log", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;

  beforeAll(async () => {
    const started = await startPostgresContainer();
    container = started.container;
    const { connectionString } = started;

    process.env.DATABASE_URL = connectionString;
    process.env.DATABASE_DIRECT_URL = connectionString;

    applyMigrations(connectionString);

    prisma = createTestPrismaClient(connectionString);
    const { setPrismaClient } = await import("@/server/db");
    setPrismaClient(prisma);

    await resetDb(prisma);
    const seeded = await seedTwoTenants(prisma);
    tenantAId = seeded.tenantA.id;
    tenantBId = seeded.tenantB.id;
    userAId = seeded.userA.id;

    await prisma.auditLog.create({
      data: {
        actorUserId: userAId,
        actorContext: "TENANT",
        tenantId: tenantAId,
        action: "integration.test.audit_a",
        targetType: "Tenant",
        targetId: tenantAId,
        metadata: { source: "integration" },
      },
    });
  }, 120_000);

  afterAll(async () => {
    const { clearPrismaClientOverride } = await import("@/server/db");
    clearPrismaClientOverride();
    await disconnectTestPrismaClient(prisma);
    await stopPostgresContainer(container);
  });

  it("audit rows for tenant A are invisible when querying as tenant B scope", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: tenantBId, action: "integration.test.audit_a" },
      select: { id: true },
    });
    expect(rows).toHaveLength(0);

    const rowsA = await prisma.auditLog.findMany({
      where: { tenantId: tenantAId, action: "integration.test.audit_a" },
      select: { id: true },
    });
    expect(rowsA.length).toBeGreaterThanOrEqual(1);
  });
});
