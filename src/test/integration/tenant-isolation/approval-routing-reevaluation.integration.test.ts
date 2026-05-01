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
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";

async function createUserInTenant(
  prisma: PrismaClient,
  tenantId: string
): Promise<{ userId: string; membershipId: string }> {
  const user = await prisma.user.create({
    data: {
      email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      name: "Extra",
    },
    select: { id: true },
  });
  const m = await prisma.tenantMembership.create({
    data: {
      tenantId,
      userId: user.id,
      status: "ACTIVE",
      isDefaultTenant: false,
    },
    select: { id: true },
  });
  return { userId: user.id, membershipId: m.id };
}

describe("tenant isolation — approval routing re-evaluation (C14)", () => {
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

  it("ADMIN_MANUAL_REEVALUATION reactivates cleared routing row (same user, no duplicate)", async () => {
    const membershipBInA = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });

    const ruleName = `ar-reeval-${Date.now()}`;
    const rule = await prisma.approvalRoutingRule.create({
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
        title: "Re-eval reactivate",
        type: RecordType.SPEND_APPROVAL,
        status: "OPEN",
      },
    });

    const first = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });
    expect(first.skipped).toBe(false);

    const now = new Date();
    await prisma.recordParticipant.updateMany({
      where: {
        tenantId: tenantAId,
        recordId: record.id,
        participantRole: "APPROVER",
        routingRuleId: { not: null },
        revokedAt: null,
        status: { in: ["PENDING", "PENDING_BLOCKED"] },
      },
      data: { revokedAt: now },
    });

    await prisma.$transaction((tx) =>
      recomputeApprovalStatus(tx, {
        tenantId: tenantAId,
        recordId: record.id,
        triggeredByAction: "PARTICIPANT_REVOKED",
        actorUserId: userAId,
      })
    );

    const second = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION,
      triggeredByUserId: userAId,
    });
    expect(second.skipped).toBe(false);
    if (second.skipped) throw new Error("unexpected");
    expect(second.outcome).toBe(ApprovalRoutingOutcome.APPROVERS_ASSIGNED);

    const parts = await prisma.recordParticipant.findMany({
      where: {
        recordId: record.id,
        tenantId: tenantAId,
        participantRole: "APPROVER",
        userId: userBId,
      },
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].revokedAt).toBeNull();
    expect(parts[0].routingRuleId).toBe(rule.id);
    expect(parts[0].status).toBe("PENDING");
  });

  it("manual approver (routingRuleId null) not revoked; remains after clear + ADMIN re-eval", async () => {
    const extra = await createUserInTenant(prisma, tenantAId);
    const membershipBInA = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });

    await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantAId,
        name: `ar-manual-${Date.now()}`,
        priority: 11,
        mode: "PARALLEL",
        status: "ACTIVE",
        triggerOnCreate: true,
        conditions: {
          create: {
            tenantId: tenantAId,
            field: ConditionField.RECORD_TYPE,
            operator: ConditionOperator.EQUALS,
            valueString: RecordType.BUDGET,
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
        title: "Manual mix",
        type: RecordType.BUDGET,
        status: "OPEN",
      },
    });

    await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });

    await prisma.recordParticipant.create({
      data: {
        tenantId: tenantAId,
        recordId: record.id,
        participantType: "INTERNAL",
        participantRole: "APPROVER",
        userId: extra.userId,
        status: "PENDING",
        routingRuleId: null,
        createdByUserId: userAId,
      },
    });

    const now = new Date();
    await prisma.recordParticipant.updateMany({
      where: {
        tenantId: tenantAId,
        recordId: record.id,
        participantRole: "APPROVER",
        routingRuleId: { not: null },
        revokedAt: null,
        status: { in: ["PENDING", "PENDING_BLOCKED"] },
      },
      data: { revokedAt: now },
    });

    await prisma.$transaction((tx) =>
      recomputeApprovalStatus(tx, {
        tenantId: tenantAId,
        recordId: record.id,
        triggeredByAction: "PARTICIPANT_REVOKED",
        actorUserId: userAId,
      })
    );

    await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION,
      triggeredByUserId: userAId,
    });

    const manual = await prisma.recordParticipant.findFirst({
      where: {
        recordId: record.id,
        tenantId: tenantAId,
        userId: extra.userId,
        participantRole: "APPROVER",
      },
    });
    expect(manual?.revokedAt).toBeNull();
    expect(manual?.routingRuleId).toBeNull();
  });

  it("APPROVED routing approver not cleared; parallel peer PENDING cleared then reactivated", async () => {
    const c = await createUserInTenant(prisma, tenantAId);
    const membershipBInA = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });

    const rule = await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantAId,
        name: `ar-par-reeval-${Date.now()}`,
        priority: 12,
        mode: "PARALLEL",
        status: "ACTIVE",
        triggerOnCreate: true,
        conditions: {
          create: {
            tenantId: tenantAId,
            field: ConditionField.RECORD_TYPE,
            operator: ConditionOperator.EQUALS,
            valueString: RecordType.REIMBURSEMENT,
          },
        },
        requiredApprovers: {
          create: [
            {
              tenantId: tenantAId,
              sequenceOrder: 1,
              targetType: ApproverTargetType.SPECIFIC_USER,
              targetMembershipId: membershipBInA.id,
            },
            {
              tenantId: tenantAId,
              sequenceOrder: 1,
              targetType: ApproverTargetType.SPECIFIC_USER,
              targetMembershipId: c.membershipId,
            },
          ],
        },
      },
    });

    const record = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "Par re-eval",
        type: RecordType.REIMBURSEMENT,
        status: "OPEN",
      },
    });

    await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });

    const step1 = await prisma.recordParticipant.findFirstOrThrow({
      where: {
        recordId: record.id,
        tenantId: tenantAId,
        userId: userBId,
        routingRuleId: rule.id,
      },
    });
    await prisma.recordParticipant.update({
      where: { id: step1.id },
      data: { status: "APPROVED", respondedAt: new Date() },
    });

    const now = new Date();
    await prisma.recordParticipant.updateMany({
      where: {
        tenantId: tenantAId,
        recordId: record.id,
        participantRole: "APPROVER",
        routingRuleId: { not: null },
        revokedAt: null,
        status: { in: ["PENDING", "PENDING_BLOCKED"] },
      },
      data: { revokedAt: now },
    });

    await prisma.$transaction((tx) =>
      recomputeApprovalStatus(tx, {
        tenantId: tenantAId,
        recordId: record.id,
        triggeredByAction: "PARTICIPANT_REVOKED",
        actorUserId: userAId,
      })
    );

    await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.ADMIN_MANUAL_REEVALUATION,
      triggeredByUserId: userAId,
    });

    const approved = await prisma.recordParticipant.findFirstOrThrow({
      where: { id: step1.id },
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.revokedAt).toBeNull();

    const step2 = await prisma.recordParticipant.findFirstOrThrow({
      where: {
        recordId: record.id,
        tenantId: tenantAId,
        userId: c.userId,
        routingRuleId: rule.id,
      },
    });
    expect(step2.revokedAt).toBeNull();
    expect(step2.status).toBe("PENDING");
  });
});

