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
import { mockAppSession, setMockSession } from "../_harness/auth-helpers-mocks";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { PrismaClient } from "@prisma/client";

describe("tenant isolation — records access", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let recordBId: string;
  let recordAId: string;
  let userCId: string;

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
    userBId = seeded.userB.id;

    const userC = await prisma.user.create({
      data: {
        email: `int-user-c-${Date.now()}@test.local`,
        name: "Integration User C",
      },
      select: { id: true },
    });
    userCId = userC.id;
    await prisma.userSecurity.create({
      data: { userId: userCId, tokenVersion: 0 },
    });
    const memberRole = await prisma.tenantRole.findFirstOrThrow({
      where: { tenantId: tenantAId, name: "Member" },
      select: { id: true },
    });
    const memC = await prisma.tenantMembership.create({
      data: {
        tenantId: tenantAId,
        userId: userCId,
        status: "ACTIVE",
        joinedAt: new Date(),
        isDefaultTenant: true,
      },
      select: { id: true },
    });
    await prisma.tenantUserRole.create({
      data: { membershipId: memC.id, roleId: memberRole.id },
    });

    const rA = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "Record A",
        type: "OTHER_FINANCIAL_REQUEST",
        status: "OPEN",
      },
      select: { id: true },
    });
    recordAId = rA.id;

    await prisma.recordParticipant.create({
      data: {
        tenantId: tenantAId,
        recordId: recordAId,
        participantType: "INTERNAL",
        participantRole: "VIEWER",
        userId: userCId,
        status: "PENDING",
      },
    });

    const rB = await prisma.record.create({
      data: {
        tenantId: tenantBId,
        createdByUserId: userBId,
        title: "Record B",
        type: "OTHER_FINANCIAL_REQUEST",
        status: "OPEN",
      },
      select: { id: true },
    });
    recordBId = rB.id;

    setMockSession(mockAppSession(userAId));
  }, 120_000);

  afterAll(async () => {
    const { clearPrismaClientOverride } = await import("@/server/db");
    clearPrismaClientOverride();
    await disconnectTestPrismaClient(prisma);
    await stopPostgresContainer(container);
  });

  it("user A cannot access tenant B record via canAccessRequest", async () => {
    const { canAccessRequest } = await import(
      "@/server/security/request-authorization"
    );
    await expect(
      canAccessRequest({
        tenantId: tenantAId,
        userId: userAId,
        requestId: recordBId,
      })
    ).resolves.toBe(false);
  });

  it("GET /api/records (tab=my) does not include tenant B records", async () => {
    setMockSession(mockAppSession(userAId));
    const { GET } = await import("@/app/api/records/route");
    const req = new Request("http://localhost/api/records?tab=my&limit=50");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.records.map((r: { id: string }) => r.id);
    expect(ids).toContain(recordAId);
    expect(ids).not.toContain(recordBId);
  });

  it("VIEWER in tenant A cannot access tenant B record via canAccessRequest", async () => {
    const { canAccessRequest } = await import(
      "@/server/security/request-authorization"
    );
    await expect(
      canAccessRequest({
        tenantId: tenantAId,
        userId: userCId,
        requestId: recordBId,
      })
    ).resolves.toBe(false);
  });
});
