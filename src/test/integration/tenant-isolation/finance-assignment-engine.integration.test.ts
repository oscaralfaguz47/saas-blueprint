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
import {
  AssignmentStrategy,
  ConditionField,
  ConditionOperator,
  EvaluationOutcome,
  FinanceStatus,
  MembershipAvailability,
  FinanceResponsibility,
  RecordApprovalStatus,
  RecordType,
} from "@prisma/client";

/**
 * Minimum subscription row so `resolveEffectiveSubscription` + `resolveTenantPlan` treat the tenant as **scale**
 * (catalog `assignmentEngine: true`). See `resolve-tenant-plan.ts` + `plans/catalog.ts`.
 */
export async function seedScaleSubscription(prisma: PrismaClient, tenantId: string): Promise<void> {
  const plan = await prisma.plan.upsert({
    where: { code: "scale" },
    create: {
      code: "scale",
      name: "Scale",
      isActive: true,
    },
    update: {},
    select: { id: true },
  });

  await prisma.subscription.upsert({
    where: { tenantId_provider: { tenantId, provider: "paddle" } },
    create: {
      tenantId,
      planId: plan.id,
      provider: "paddle",
      status: "ACTIVE",
      billingInterval: "monthly",
    },
    update: {
      planId: plan.id,
      status: "ACTIVE",
    },
  });
}

async function enableAssignmentEngine(prisma: PrismaClient, tenantId: string): Promise<void> {
  const flag = await prisma.featureFlag.upsert({
    where: { code: "FT_ASSIGNMENT_ENGINE_ENABLED" },
    create: {
      id: `cfflag-int-${Date.now()}`,
      code: "FT_ASSIGNMENT_ENGINE_ENABLED",
      description: "integration test",
    },
    update: {},
    select: { id: true },
  });
  await prisma.tenantFeatureFlag.upsert({
    where: { tenantId_featureFlagId: { tenantId, featureFlagId: flag.id } },
    create: { tenantId, featureFlagId: flag.id, isEnabled: true },
    update: { isEnabled: true },
  });
}

describe("tenant isolation — finance assignment engine", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let membershipAId: string;

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
    membershipAId = seeded.membershipA.id;

    await seedScaleSubscription(prisma, tenantAId);
    await enableAssignmentEngine(prisma, tenantAId);

    await prisma.tenantMembership.update({
      where: { id: membershipAId },
      data: {
        financeResponsibility: FinanceResponsibility.PROCESS_AND_APPROVE,
        availability: MembershipAvailability.AVAILABLE,
      },
    });
  }, 120_000);

  afterAll(async () => {
    const { clearPrismaClientOverride } = await import("@/server/db");
    clearPrismaClientOverride();
    await disconnectTestPrismaClient(prisma);
    await stopPostgresContainer(container);
  });

  async function createTeamRuleRecord(
    label: string,
    opts: { recordType?: RecordType; conditionType?: string; availability?: MembershipAvailability } = {}
  ) {
    const recordType = opts.recordType ?? RecordType.OTHER_FINANCIAL_REQUEST;
    const conditionValue = opts.conditionType ?? "OTHER_FINANCIAL_REQUEST";

    const team = await prisma.financeTeam.create({
      data: {
        tenantId: tenantAId,
        name: `FT ${label}`,
        isActive: true,
      },
    });
    await prisma.financeTeamMember.create({
      data: {
        tenantId: tenantAId,
        teamId: team.id,
        membershipId: membershipAId,
        weight: 100,
        isLead: false,
      },
    });
    const rule = await prisma.financeAssignmentRule.create({
      data: {
        tenantId: tenantAId,
        teamId: team.id,
        name: `Rule ${label}`,
        priority: 10,
        strategy: AssignmentStrategy.ROUND_ROBIN,
        status: "ACTIVE",
        conditions: {
          create: [
            {
              tenantId: tenantAId,
              field: ConditionField.RECORD_TYPE,
              operator: ConditionOperator.EQUALS,
              valueString: conditionValue,
            },
          ],
        },
      },
    });

    if (opts.availability != null) {
      await prisma.tenantMembership.update({
        where: { id: membershipAId },
        data: { availability: opts.availability },
      });
    }

    const record = await prisma.record.create({
      data: {
        tenantId: tenantAId,
        createdByUserId: userAId,
        title: `R ${label}`,
        type: recordType,
        status: "OPEN",
        approvalStatus: RecordApprovalStatus.FULLY_APPROVED,
        financeStatus: FinanceStatus.PENDING_ASSIGNMENT,
      },
    });

    return { team, rule, record };
  }

  it("assigns eligible finance member and increments workload (Scale + flag)", async () => {
    const label = `assign-${Date.now()}`;
    const { record } = await createTeamRuleRecord(label);
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    const beforeCount = await prisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipAId },
      select: { financeOpenAssignmentsCount: true },
    });

    const out = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: "TEST",
      triggeredByUserId: userAId,
    });

    expect(out.outcome).toBe(EvaluationOutcome.ASSIGNED);
    expect(out.assignedMembershipId).toBe(membershipAId);

    const updated = await prisma.record.findUniqueOrThrow({
      where: { id: record.id },
      select: {
        financeAssignedMembershipId: true,
        financeStatus: true,
        financeAssignedByRuleId: true,
      },
    });
    expect(updated.financeAssignedMembershipId).toBe(membershipAId);
    expect(updated.financeStatus).toBe(FinanceStatus.ASSIGNED);
    expect(updated.financeAssignedByRuleId).not.toBeNull();

    const afterCount = await prisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipAId },
      select: { financeOpenAssignmentsCount: true },
    });
    expect(afterCount.financeOpenAssignmentsCount).toBe(beforeCount.financeOpenAssignmentsCount + 1);

    const ev = await prisma.financeAssignmentEvaluation.findFirstOrThrow({
      where: { recordId: record.id },
      orderBy: { triggeredAt: "desc" },
    });
    expect(ev.outcome).toBe(EvaluationOutcome.ASSIGNED);
    expect(ev.selectionStrategy).toBe(AssignmentStrategy.ROUND_ROBIN);
  });

  it("idempotent replay: second run does not increment counter or change assignee", async () => {
    const label = `idem-${Date.now()}`;
    const { record } = await createTeamRuleRecord(label);
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: "TEST",
      triggeredByUserId: userAId,
    });

    const mid = await prisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipAId },
      select: { financeOpenAssignmentsCount: true },
    });

    const out2 = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: "TEST",
      triggeredByUserId: null,
    });

    expect(out2.outcome).toBe(EvaluationOutcome.ASSIGNED);
    expect(out2.matchedRuleId).toBeNull();

    const replay = await prisma.financeAssignmentEvaluation.findFirstOrThrow({
      where: { recordId: record.id, selectionStrategy: "IDEMPOTENT_REPLAY" },
      orderBy: { triggeredAt: "desc" },
    });
    expect(replay.rulesEvaluated).toEqual([]);
    expect(replay.candidatesEvaluated).toEqual([]);

    const after = await prisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipAId },
      select: { financeOpenAssignmentsCount: true },
    });
    expect(after.financeOpenAssignmentsCount).toBe(mid.financeOpenAssignmentsCount);
  });

  it("wrong tenantId: record not found (throws)", async () => {
    const label = `iso-${Date.now()}`;
    const { record } = await createTeamRuleRecord(label);
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    await expect(
      evaluateAndAssign({
        tenantId: tenantBId,
        recordId: record.id,
        triggerEvent: "TEST",
        triggeredByUserId: userAId,
      })
    ).rejects.toThrow(/Record not found/);
  });

  it("PLAN_NOT_ENTITLED without Scale subscription", async () => {
    const label = `plan-${Date.now()}`;
    await createTeamRuleRecord(label);
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    const recordB = await prisma.record.create({
      data: {
        tenantId: tenantBId,
        createdByUserId: userBId,
        title: `RB ${label}`,
        type: RecordType.OTHER_FINANCIAL_REQUEST,
        status: "OPEN",
        approvalStatus: RecordApprovalStatus.FULLY_APPROVED,
        financeStatus: FinanceStatus.PENDING_ASSIGNMENT,
      },
    });

    const out = await evaluateAndAssign({
      tenantId: tenantBId,
      recordId: recordB.id,
      triggerEvent: "TEST",
      triggeredByUserId: userBId,
    });

    expect(out.outcome).toBe(EvaluationOutcome.PLAN_NOT_ENTITLED);
  });

  it("ENGINE_DISABLED when tenant feature flag is off", async () => {
    const flag = await prisma.featureFlag.findUniqueOrThrow({
      where: { code: "FT_ASSIGNMENT_ENGINE_ENABLED" },
      select: { id: true },
    });
    await prisma.tenantFeatureFlag.updateMany({
      where: { tenantId: tenantAId, featureFlagId: flag.id },
      data: { isEnabled: false },
    });

    const label = `flag-${Date.now()}`;
    const { record } = await createTeamRuleRecord(label);
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    const out = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: "TEST",
      triggeredByUserId: userAId,
    });
    expect(out.outcome).toBe(EvaluationOutcome.ENGINE_DISABLED);

    await prisma.tenantFeatureFlag.updateMany({
      where: { tenantId: tenantAId, featureFlagId: flag.id },
      data: { isEnabled: true },
    });
  });

  it("NO_RULE_MATCHED when no rule applies", async () => {
    await prisma.financeAssignmentRule.updateMany({
      where: { tenantId: tenantAId },
      data: { status: "PAUSED" },
    });
    const label = `norule-${Date.now()}`;
    const { record } = await createTeamRuleRecord(label, { conditionType: "BUDGET_REQUEST" });
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    const out = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: "TEST",
      triggeredByUserId: userAId,
    });
    expect(out.outcome).toBe(EvaluationOutcome.NO_RULE_MATCHED);
  });

  it("NO_CANDIDATES_AVAILABLE when all members excluded (OOO)", async () => {
    const label = `ooo-${Date.now()}`;
    const { record } = await createTeamRuleRecord(label, {
      availability: MembershipAvailability.OUT_OF_OFFICE,
    });
    const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");

    const out = await evaluateAndAssign({
      tenantId: tenantAId,
      recordId: record.id,
      triggerEvent: "TEST",
      triggeredByUserId: userAId,
    });
    expect(out.outcome).toBe(EvaluationOutcome.NO_CANDIDATES_AVAILABLE);

    await prisma.tenantMembership.update({
      where: { id: membershipAId },
      data: { availability: MembershipAvailability.AVAILABLE },
    });
  });
});
