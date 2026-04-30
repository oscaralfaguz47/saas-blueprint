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

describe("tenant isolation — participants create", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let userCId: string;
  let recordBId: string;
  let recordAId: string;
  let revokedParticipantId: string;

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

    const memberRole = await prisma.tenantRole.findFirstOrThrow({
      where: { tenantId: tenantAId, name: "Member" },
      select: { id: true },
    });

    const userC = await prisma.user.create({
      data: {
        email: `int-participants-c-${Date.now()}@test.local`,
        name: "User C",
      },
      select: { id: true },
    });
    userCId = userC.id;
    await prisma.userSecurity.create({
      data: { userId: userCId, tokenVersion: 0 },
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
        title: "Record A participants",
        type: "OTHER_FINANCIAL_REQUEST",
        status: "OPEN",
      },
      select: { id: true },
    });
    recordAId = rA.id;

    const revoked = await prisma.recordParticipant.create({
      data: {
        tenantId: tenantAId,
        recordId: recordAId,
        participantType: "INTERNAL",
        participantRole: "VIEWER",
        userId: userCId,
        status: "PENDING",
        revokedAt: new Date(),
      },
      select: { id: true },
    });
    revokedParticipantId = revoked.id;

    const rB = await prisma.record.create({
      data: {
        tenantId: tenantBId,
        createdByUserId: userBId,
        title: "Record B iso",
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

  it("cross-tenant participant create returns 404 (concealment)", async () => {
    setMockSession(mockAppSession(userAId));
    const { POST } = await import("@/app/api/records/[id]/participants/route");

    const req = new Request("http://localhost/api/records/x/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userCId, participantRole: "VIEWER" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: recordBId }),
    });
    expect(res.status).toBe(404);
  });

  it("user B cannot reactivate a revoked participant on tenant A record (404)", async () => {
    setMockSession(mockAppSession(userBId));
    const { POST } = await import("@/app/api/records/[id]/participants/route");

    const req = new Request("http://localhost/api/records/x/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userCId, participantRole: "VIEWER" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: recordAId }),
    });
    expect(res.status).toBe(404);

    const p = await prisma.recordParticipant.findUniqueOrThrow({
      where: { id: revokedParticipantId },
      select: { revokedAt: true },
    });
    expect(p.revokedAt).not.toBeNull();
  });
});
