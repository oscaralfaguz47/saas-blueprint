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
  ConditionField,
  ConditionOperator,
  RecordType,
} from "@prisma/client";
import {
  APPROVAL_ROUTING_TRIGGER_EVENTS,
  evaluateAndAssign,
} from "@/server/services/approval-routing-engine";
import { unblockNextStepIfReady } from "@/server/services/approval-routing-engine/unblock-next-step";
import { maybeUnblockNextApprovalStep } from "@/server/services/approval-unblock-hook";
import { recomputeApprovalStatus } from "@/server/services/record-approval-status";

describe("tenant isolation — approval routing unblock (C13b)", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
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

  async function createUserInTenant(tenantId: string): Promise<{ userId: string; membershipId: string }> {
    const u = await prisma.user.create({
      data: { email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, name: "U" },
    });
    await prisma.userSecurity.create({ data: { userId: u.id, tokenVersion: 0 } });
    const m = await prisma.tenantMembership.create({
      data: {
        tenantId,
        userId: u.id,
        status: "ACTIVE",
        isDefaultTenant: false,
      },
      select: { id: true },
    });
    return { userId: u.id, membershipId: m.id };
  }

  it("sequential: approving step 1 unblocks step 2 and notifies", async () => {
    const mB = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });
    const c = await createUserInTenant(tenantAId);
    const d = await createUserInTenant(tenantAId);

    const ruleName = `seq-unblock-${Date.now()}`;
    await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantAId,
        name: ruleName,
        priority: 10,
        mode: "SEQUENTIAL",
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
          create: [
            {
              tenantId: tenantAId,
              sequenceOrder: 1,
              targetType: ApproverTargetType.SPECIFIC_USER,
              targetMembershipId: mB.id,
            },
            {
              tenantId: tenantAId,
              sequenceOrder: 2,
              targetType: ApproverTargetType.SPECIFIC_USER,
              targetMembershipId: c.membershipId,
            },
            {
              tenantId: tenantAId,
              sequenceOrder: 3,
              targetType: ApproverTargetType.SPECIFIC_USER,
              targetMembershipId: d.membershipId,
            },
          ],
        },
      },
    });

    const record = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: "Sequential unblock",
        type: RecordType.SPEND_APPROVAL,
        status: "OPEN",
      },
    });

    const assignResult = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: APPROVAL_ROUTING_TRIGGER_EVENTS.RECORD_CREATED,
      triggeredByUserId: userAId,
    });
    expect(assignResult.skipped).toBe(false);
    if (assignResult.skipped) throw new Error("unexpected skip");

    const parts = await prisma.recordParticipant.findMany({
      where: { recordId: record.id, tenantId: tenantAId, participantRole: "APPROVER" },
      orderBy: { sequenceOrder: "asc" },
    });
    expect(parts).toHaveLength(3);
    expect(parts[0].status).toBe("PENDING");
    expect(parts[1].status).toBe("PENDING_BLOCKED");
    expect(parts[2].status).toBe("PENDING_BLOCKED");

    const step1Id = parts[0].id;

    let reconcileResult: Awaited<ReturnType<typeof recomputeApprovalStatus>> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.recordParticipant.update({
        where: { id: step1Id, tenantId: tenantAId },
        data: { status: "APPROVED", respondedAt: new Date() },
      });
      reconcileResult = await recomputeApprovalStatus(tx, {
        tenantId: tenantAId,
        recordId: record.id,
        triggeredByParticipantId: step1Id,
        triggeredByAction: "INTERNAL_APPROVED",
        actorUserId: userBId,
      });
    });

    expect(reconcileResult).toBeDefined();
    const rec = reconcileResult!;

    const unblockOut = await maybeUnblockNextApprovalStep(prisma, rec, {
      tenantId: tenantAId,
      recordId: record.id,
      actorUserId: userBId,
      triggeredByParticipantId: step1Id,
      triggeredByAction: "INTERNAL_APPROVED",
    });
    expect(unblockOut.unblockedCount).toBe(1);

    const after = await prisma.recordParticipant.findMany({
      where: { recordId: record.id, tenantId: tenantAId, participantRole: "APPROVER" },
      orderBy: { sequenceOrder: "asc" },
    });
    expect(after[1].status).toBe("PENDING");

    const notif = await prisma.userNotification.findFirst({
      where: { userId: c.userId, notificationType: "RECORD_APPROVAL_REQUESTED" },
    });
    expect(notif).not.toBeNull();
  });

  it("CAS: concurrent unblockNextStepIfReady — only one transaction flips rows", async () => {
    const mB = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });
    const c = await createUserInTenant(tenantAId);

    const ruleName = `seq-cas-${Date.now()}`;
    const rule = await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantAId,
        name: ruleName,
        priority: 10,
        mode: "SEQUENTIAL",
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
          create: [
            {
              tenantId: tenantAId,
              sequenceOrder: 1,
              targetType: ApproverTargetType.SPECIFIC_USER,
              targetMembershipId: mB.id,
            },
            {
              tenantId: tenantAId,
              sequenceOrder: 2,
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
        title: "CAS unblock",
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

    const step1 = await prisma.recordParticipant.findFirstOrThrow({
      where: {
        recordId: record.id,
        tenantId: tenantAId,
        sequenceOrder: 1,
        routingRuleId: rule.id,
      },
    });
    await prisma.recordParticipant.update({
      where: { id: step1.id },
      data: { status: "APPROVED", respondedAt: new Date() },
    });

    const [a, b] = await Promise.all([
      prisma.$transaction((tx) =>
        unblockNextStepIfReady(tx, {
          tenantId: tenantAId,
          recordId: record.id,
          actorUserId: userAId,
        })
      ),
      prisma.$transaction((tx) =>
        unblockNextStepIfReady(tx, {
          tenantId: tenantAId,
          recordId: record.id,
          actorUserId: userAId,
        })
      ),
    ]);

    const counts = [a.unblockedCount, b.unblockedCount].filter((n) => n > 0);
    expect(counts.length).toBe(1);
    expect(counts[0]).toBe(1);

    const step2 = await prisma.recordParticipant.findFirstOrThrow({
      where: {
        recordId: record.id,
        tenantId: tenantAId,
        sequenceOrder: 2,
        routingRuleId: rule.id,
      },
    });
    expect(step2.status).toBe("PENDING");
  });

  it("does not update manual approvers (routingRuleId null)", async () => {
    const mB = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
      select: { id: true },
    });
    const c = await createUserInTenant(tenantAId);

    const ruleName = `seq-mix-${Date.now()}`;
    await prisma.approvalRoutingRule.create({
      data: {
        tenantId: tenantAId,
        name: ruleName,
        priority: 10,
        mode: "SEQUENTIAL",
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
              targetMembershipId: mB.id,
            },
            {
              tenantId: tenantAId,
              sequenceOrder: 2,
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
        title: "Mixed manual",
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

    const manualUser = await createUserInTenant(tenantAId);
    const manual = await prisma.recordParticipant.create({
      data: {
        tenantId: tenantAId,
        recordId: record.id,
        participantType: "INTERNAL",
        participantRole: "APPROVER",
        userId: manualUser.userId,
        status: "PENDING_BLOCKED",
        sequenceOrder: 2,
        routingRuleId: null,
        createdByUserId: userAId,
      },
    });

    const step1 = await prisma.recordParticipant.findFirstOrThrow({
      where: { recordId: record.id, tenantId: tenantAId, sequenceOrder: 1, routingRuleId: { not: null } },
    });
    await prisma.recordParticipant.update({
      where: { id: step1.id },
      data: { status: "APPROVED", respondedAt: new Date() },
    });

    await prisma.$transaction((tx) =>
      unblockNextStepIfReady(tx, {
        tenantId: tenantAId,
        recordId: record.id,
        actorUserId: userAId,
      })
    );

    const manualAfter = await prisma.recordParticipant.findUniqueOrThrow({ where: { id: manual.id } });
    expect(manualAfter.status).toBe("PENDING_BLOCKED");
  });
});
