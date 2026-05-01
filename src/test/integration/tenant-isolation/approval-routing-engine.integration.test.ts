import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../_harness/auth-helpers-mocks";
import {
  applyMigrations,
  createTestPrismaClient,
  disconnectTestPrismaClient,
  resetDb,
  seedScaleSubscription,
  seedTwoTenants,
  startPostgresContainer,
  stopPostgresContainer,
} from "../_harness";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { PrismaClient } from "@prisma/client";
import {
  ApproverTargetType,
  ApprovalRoutingOutcome,
  ConditionField,
  ConditionOperator,
  RecordType,
} from "@prisma/client";
import {
  APPROVAL_ROUTING_TRIGGER_EVENTS,
  evaluateAndAssign,
} from "@/server/services/approval-routing-engine";

describe("tenant isolation — approval routing engine (C13a)", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;

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

    await seedScaleSubscription(prisma, tenantAId);

    await prisma.tenantMembership.create({
      data: {
        tenantId: tenantAId,
        userId: userBId,
        status: "ACTIVE",
        isDefaultTenant: false,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await disconnectTestPrismaClient(prisma);
    await stopPostgresContainer(container);
  });

  it("assigns internal approvers when an ACTIVE rule matches an OPEN record (tenant-scoped)", async () => {
    const membershipBInA = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });

    const ruleName = `ar-int-${Date.now()}`;
    await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantAId,
        name: ruleName,
        priority: 10,
        mode: "PARALLEL",
        status: "ACTIVE",
        triggerOnCreate: true,
        conditions: {
          create: {
            tenantId: tenantAId,
            field: ConditionField.RECORD_TYPE,
            operator: ConditionOperator.EQUALS,
            valueString: RecordType.SPEND_APPROVAL,
          },
        },
        requiredApprovers: {
          create: {
            tenantId: tenantAId,
            sequenceOrder: 1,
            targetType: ApproverTargetType.SPECIFIC_USER,
            targetMembershipId: membershipBInA.id,
          },
        },
      },
    });

    const record = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "Spend approval routing",
        type: RecordType.SPEND_APPROVAL,
        status: "OPEN",
      },
    });

    const result = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("unexpected skip");
    expect(result.outcome).toBe(ApprovalRoutingOutcome.APPROVERS_ASSIGNED);

    const parts = await prisma.recordParticipant.findMany({
      where: { recordId: record.id, tenantId: tenantAId, participantRole: "APPROVER" },
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].userId).toBe(userBId);
    expect(parts[0].status).toBe("PENDING");
    expect(parts[0].sequenceOrder).toBe(1);

    const notif = await prisma.userNotification.findFirst({
      where: { userId: userBId, notificationType: "RECORD_APPROVAL_REQUESTED" },
    });
    expect(notif).not.toBeNull();
  });

  it("does not persist an evaluation when record is not OPEN", async () => {
    const record = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "Draft only",
        type: RecordType.SPEND_APPROVAL,
        status: "DRAFT",
      },
    });

    const before = await prisma.approvalRoutingEvaluation.count({
      where: { recordId: record.id },
    });

    const result = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });

    expect(result).toEqual({ skipped: true, reason: "NOT_OPEN" });

    const after = await prisma.approvalRoutingEvaluation.count({
      where: { recordId: record.id },
    });
    expect(after).toBe(before);
  });

  it("does not use another tenant's routing rules", async () => {
    const membershipBInB = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantBId, userId: userBId } },
      select: { id: true },
    });

    await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantBId,
        name: `ar-other-tenant-${Date.now()}`,
        priority: 5,
        mode: "PARALLEL",
        status: "ACTIVE",
        triggerOnCreate: true,
        conditions: {
          create: {
            tenantId: tenantBId,
            field: ConditionField.RECORD_TYPE,
            operator: ConditionOperator.EQUALS,
            valueString: RecordType.SPEND_APPROVAL,
          },
        },
        requiredApprovers: {
          create: {
            tenantId: tenantBId,
            sequenceOrder: 1,
            targetType: ApproverTargetType.SPECIFIC_USER,
            targetMembershipId: membershipBInB.id,
          },
        },
      },
    });

    const record = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "No rule in A for this type",
        type: RecordType.BUDGET,
        status: "OPEN",
      },
    });

    const result = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("unexpected skip");
    expect(result.outcome).toBe(ApprovalRoutingOutcome.NO_RULE_MATCHED);

    const parts = await prisma.recordParticipant.count({
      where: { recordId: record.id, tenantId: tenantAId, participantRole: "APPROVER" },
    });
    expect(parts).toBe(0);
  });
});
