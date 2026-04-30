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

describe("tenant isolation — approval status recompute", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let recordAId: string;
  let recordBId: string;

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

    const memBOnA = await prisma.tenantMembership.create({
      data: {
        tenantId: tenantAId,
        userId: userBId,
        status: "ACTIVE",
        joinedAt: new Date(),
        isDefaultTenant: false,
      },
      select: { id: true },
    });
    const memberRole = await prisma.tenantRole.findFirstOrThrow({
      where: { tenantId: tenantAId, name: "Member" },
      select: { id: true },
    });
    await prisma.tenantUserRole.create({
      data: { membershipId: memBOnA.id, roleId: memberRole.id },
    });

    const rA = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "RA",
        type: "OTHER_FINANCIAL_REQUEST",
        status: "OPEN",
        approvalStatus: "NOT_STARTED",
      },
      select: { id: true },
    });
    recordAId = rA.id;

    await prisma.recordParticipant.create({
      data: {
        tenantId: tenantAId,
        recordId: recordAId,
        participantType: "INTERNAL",
        participantRole: "APPROVER",
        userId: userBId,
        status: "PENDING",
      },
    });

    const rB = await prisma.record.create({
      data: {
        tenantId: tenantBId,
        createdByUserId: userBId,
        title: "RB",
        type: "OTHER_FINANCIAL_REQUEST",
        status: "OPEN",
        approvalStatus: "NOT_STARTED",
      },
      select: { id: true },
    });
    recordBId = rB.id;
  }, 120_000);

  afterAll(async () => {
    const { clearPrismaClientOverride } = await import("@/server/db");
    clearPrismaClientOverride();
    await disconnectTestPrismaClient(prisma);
    await stopPostgresContainer(container);
  });

  it("recompute with mismatched tenantId throws and does not change record B", async () => {
    const { recomputeApprovalStatus } = await import(
      "@/server/services/record-approval-status"
    );

    const before = await prisma.record.findUnique({
      where: { id: recordBId },
      select: { approvalStatus: true },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await recomputeApprovalStatus(tx, {
          tenantId: tenantAId,
          recordId: recordBId,
          actorUserId: userAId,
        });
      })
    ).rejects.toThrow(/Record not found for approval recompute/);

    const after = await prisma.record.findUnique({
      where: { id: recordBId },
      select: { approvalStatus: true },
    });
    expect(after?.approvalStatus).toBe(before?.approvalStatus);
  });

  it("scoped recompute updates only the intended tenant record", async () => {
    const { recomputeApprovalStatus } = await import(
      "@/server/services/record-approval-status"
    );

    const beforeB = await prisma.record.findUnique({
      where: { id: recordBId },
      select: { approvalStatus: true },
    });

    await prisma.$transaction(async (tx) => {
      await recomputeApprovalStatus(tx, {
        tenantId: tenantAId,
        recordId: recordAId,
        actorUserId: userAId,
      });
    });

    const afterA = await prisma.record.findUnique({
      where: { id: recordAId },
      select: { approvalStatus: true },
    });
    expect(afterA?.approvalStatus).toBe("WAITING_FOR_APPROVAL");

    const afterB = await prisma.record.findUnique({
      where: { id: recordBId },
      select: { approvalStatus: true },
    });
    expect(afterB?.approvalStatus).toBe(beforeB?.approvalStatus);
  });
});
