import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "../_harness/auth-helpers-mocks";
import { mockAppSession, setMockSession } from "../_harness/auth-helpers-mocks";
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

  describe("C8 approval-completion hook", () => {
    it("recompute FULLY_APPROVED then maybeAssignFinanceAfterApprovalReconcile assigns", async () => {
      const suffix = `${Date.now()}`;
      const memBOnA = await prisma.tenantMembership.create({
        data: {
          tenantId: tenantAId,
          userId: userBId,
          status: "ACTIVE",
          joinedAt: new Date(),
          isDefaultTenant: false,
          financeResponsibility: FinanceResponsibility.PROCESS_AND_APPROVE,
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

      const team = await prisma.financeTeam.create({
        data: { tenantId: tenantAId, name: `C8 FT ${suffix}`, isActive: true },
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
      await prisma.financeAssignmentRule.create({
        data: {
          tenantId: tenantAId,
          teamId: team.id,
          name: `C8 Rule ${suffix}`,
          priority: 10,
          strategy: AssignmentStrategy.ROUND_ROBIN,
          status: "ACTIVE",
          conditions: {
            create: [
              {
                tenantId: tenantAId,
                field: ConditionField.RECORD_TYPE,
                operator: ConditionOperator.EQUALS,
                valueString: "OTHER_FINANCIAL_REQUEST",
              },
            ],
          },
        },
      });

      const record = await prisma.record.create({
        data: {
          tenantId: tenantAId,
          createdByUserId: userAId,
          title: `C8 ${suffix}`,
          type: RecordType.OTHER_FINANCIAL_REQUEST,
          status: "OPEN",
          approvalStatus: RecordApprovalStatus.WAITING_FOR_APPROVAL,
        },
      });

      const participant = await prisma.recordParticipant.create({
        data: {
          tenantId: tenantAId,
          recordId: record.id,
          participantType: "INTERNAL",
          participantRole: "APPROVER",
          userId: userBId,
          status: "PENDING",
        },
        select: { id: true },
      });

      let reconcileResult: Awaited<
        ReturnType<typeof import("@/server/services/record-approval-status").recomputeApprovalStatus>
      >;

      await prisma.$transaction(async (tx) => {
        await tx.recordParticipant.update({
          where: { id: participant.id },
          data: { status: "APPROVED", respondedAt: new Date() },
        });
        const { recomputeApprovalStatus } = await import(
          "@/server/services/record-approval-status"
        );
        reconcileResult = await recomputeApprovalStatus(tx, {
          tenantId: tenantAId,
          recordId: record.id,
          triggeredByParticipantId: participant.id,
          triggeredByAction: "INTERNAL_APPROVED",
          actorUserId: userBId,
        });
      });

      const { maybeAssignFinanceAfterApprovalReconcile } = await import(
        "@/server/services/approval-completion-hook"
      );
      const hookOut = await maybeAssignFinanceAfterApprovalReconcile(prisma, reconcileResult!, {
        tenantId: tenantAId,
        recordId: record.id,
        actorUserId: userBId,
      });

      expect(reconcileResult!.newStatus).toBe(RecordApprovalStatus.FULLY_APPROVED);
      expect(hookOut.engineTriggered).toBe(true);
      expect(hookOut.engineOutcome).toBe(EvaluationOutcome.ASSIGNED);

      const updated = await prisma.record.findUniqueOrThrow({
        where: { id: record.id },
        select: { financeAssignedMembershipId: true, financeStatus: true },
      });
      expect(updated.financeAssignedMembershipId).toBe(membershipAId);
      expect(updated.financeStatus).toBe(FinanceStatus.ASSIGNED);
    });

    it("maybeAssignFinanceAfterApprovalReconcile does not throw when engine throws", async () => {
      const engine = await import("@/server/services/finance-assignment-engine/index");
      const spy = vi
        .spyOn(engine, "evaluateAndAssign")
        .mockRejectedValue(new Error("simulated engine failure"));

      const { maybeAssignFinanceAfterApprovalReconcile } = await import(
        "@/server/services/approval-completion-hook"
      );

      await expect(
        maybeAssignFinanceAfterApprovalReconcile(
          prisma,
          {
            previousStatus: RecordApprovalStatus.WAITING_FOR_APPROVAL,
            newStatus: RecordApprovalStatus.FULLY_APPROVED,
            changed: true,
            isTerminalTransition: true,
          },
          { tenantId: tenantAId, recordId: "nonexistent-record-id", actorUserId: userAId }
        )
      ).resolves.toMatchObject({
        engineTriggered: false,
        engineEvaluationId: null,
        engineOutcome: null,
      });

      spy.mockRestore();
    });
  });

  describe("C9 finance queue", () => {
    it("lifecycle: start keeps counter; complete decrements and sets COMPLETED", async () => {
      const label = `c9-life-${Date.now()}`;
      const { record } = await createTeamRuleRecord(label);
      const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");
      await evaluateAndAssign({
        tenantId: tenantAId,
        recordId: record.id,
        triggerEvent: "TEST",
        triggeredByUserId: userAId,
      });

      const beforeStart = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });
      expect(beforeStart.financeOpenAssignmentsCount).toBeGreaterThanOrEqual(1);

      setMockSession(mockAppSession(userAId));
      const { POST: POST_START } = await import("@/app/api/finance/queue/[recordId]/start/route");
      let res = await POST_START(new Request("http://localhost"), {
        params: Promise.resolve({ recordId: record.id }),
      });
      expect(res.status).toBe(200);

      const afterStart = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });
      expect(afterStart.financeOpenAssignmentsCount).toBe(beforeStart.financeOpenAssignmentsCount);

      const { POST: POST_COMPLETE } = await import("@/app/api/finance/queue/[recordId]/complete/route");
      res = await POST_COMPLETE(new Request("http://localhost"), {
        params: Promise.resolve({ recordId: record.id }),
      });
      expect(res.status).toBe(200);

      const afterComplete = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });
      expect(afterComplete.financeOpenAssignmentsCount).toBe(beforeStart.financeOpenAssignmentsCount - 1);

      const rec = await prisma.record.findUniqueOrThrow({ where: { id: record.id } });
      expect(rec.financeStatus).toBe(FinanceStatus.COMPLETED);
    });

    it("release clears assignment, decrements, and records RELEASE_BY_ASSIGNEE evaluation", async () => {
      const label = `c9-rel-${Date.now()}`;
      const { record } = await createTeamRuleRecord(label);
      const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");
      await evaluateAndAssign({
        tenantId: tenantAId,
        recordId: record.id,
        triggerEvent: "TEST",
        triggeredByUserId: userAId,
      });

      const before = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });

      setMockSession(mockAppSession(userAId));
      const { POST: POST_RELEASE } = await import("@/app/api/finance/queue/[recordId]/release/route");
      const res = await POST_RELEASE(new Request("http://localhost"), {
        params: Promise.resolve({ recordId: record.id }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.reEvaluationTriggered).toBe(true);

      const releaseEval = await prisma.financeAssignmentEvaluation.findFirst({
        where: { recordId: record.id, triggeredByEvent: "RELEASE_BY_ASSIGNEE" },
        orderBy: { triggeredAt: "desc" },
      });
      expect(releaseEval).not.toBeNull();

      const rec = await prisma.record.findUniqueOrThrow({ where: { id: record.id } });
      const after = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });
      // Release decrements then engine may re-assign the same member (net counter unchanged).
      expect(after.financeOpenAssignmentsCount).toBe(before.financeOpenAssignmentsCount);
      expect(rec.financeStatus).toBe(FinanceStatus.ASSIGNED);
      expect(rec.financeAssignedMembershipId).toBe(membershipAId);
    });

    it("cross-tenant: user B gets 404 acting on tenant A record id", async () => {
      const label = `c9-iso-${Date.now()}`;
      const { record } = await createTeamRuleRecord(label);
      setMockSession(mockAppSession(userBId));
      const { POST: POST_START } = await import("@/app/api/finance/queue/[recordId]/start/route");
      const res = await POST_START(new Request("http://localhost"), {
        params: Promise.resolve({ recordId: record.id }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("C10 finance reassignment", () => {
    it("Direct mode: swaps assignee, counters, MANUAL_REASSIGN snapshot and FINANCE_REASSIGNED event", async () => {
      const suffix = `${Date.now()}`;
      const memberRole = await prisma.tenantRole.findFirstOrThrow({
        where: { tenantId: tenantAId, name: "Member" },
        select: { id: true },
      });
      let memBOnA = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: tenantAId, userId: userBId } },
        select: { id: true },
      });
      if (!memBOnA) {
        memBOnA = await prisma.tenantMembership.create({
          data: {
            tenantId: tenantAId,
            userId: userBId,
            status: "ACTIVE",
            joinedAt: new Date(),
            isDefaultTenant: false,
            financeResponsibility: FinanceResponsibility.PROCESS_AND_APPROVE,
          },
          select: { id: true },
        });
        await prisma.tenantUserRole.create({
          data: { membershipId: memBOnA.id, roleId: memberRole.id },
        });
      } else {
        await prisma.tenantMembership.update({
          where: { id: memBOnA.id },
          data: {
            financeResponsibility: FinanceResponsibility.PROCESS_AND_APPROVE,
            status: "ACTIVE",
          },
        });
        const hasMemberRole = await prisma.tenantUserRole.findFirst({
          where: { membershipId: memBOnA.id, roleId: memberRole.id },
        });
        if (!hasMemberRole) {
          await prisma.tenantUserRole.create({
            data: { membershipId: memBOnA.id, roleId: memberRole.id },
          });
        }
      }

      const label = `c10-dir-${suffix}`;
      const { record } = await createTeamRuleRecord(label);
      const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");
      await evaluateAndAssign({
        tenantId: tenantAId,
        recordId: record.id,
        triggerEvent: "TEST",
        triggeredByUserId: userAId,
      });

      const countBeforeA = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });
      const countBeforeB = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: memBOnA.id },
        select: { financeOpenAssignmentsCount: true },
      });
      expect(countBeforeA.financeOpenAssignmentsCount).toBeGreaterThanOrEqual(1);

      setMockSession(mockAppSession(userAId));
      const { POST: POST_REASSIGN } = await import(
        "@/app/api/finance/assignments/[recordId]/reassign/route"
      );
      const res = await POST_REASSIGN(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetMembershipId: memBOnA.id, note: "admin override" }),
        }),
        { params: Promise.resolve({ recordId: record.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.mode).toBe("DIRECT");

      const rec = await prisma.record.findUniqueOrThrow({ where: { id: record.id } });
      expect(rec.financeAssignedMembershipId).toBe(memBOnA.id);
      expect(rec.financeStatus).toBe(FinanceStatus.ASSIGNED);
      expect(rec.financeAssignedByRuleId).toBeNull();

      const countAfterA = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: membershipAId },
        select: { financeOpenAssignmentsCount: true },
      });
      const countAfterB = await prisma.tenantMembership.findUniqueOrThrow({
        where: { id: memBOnA.id },
        select: { financeOpenAssignmentsCount: true },
      });
      expect(countAfterA.financeOpenAssignmentsCount).toBe(
        countBeforeA.financeOpenAssignmentsCount - 1
      );
      expect(countAfterB.financeOpenAssignmentsCount).toBe(
        countBeforeB.financeOpenAssignmentsCount + 1
      );

      const manual = await prisma.financeAssignmentEvaluation.findFirst({
        where: { recordId: record.id, selectionStrategy: "MANUAL_REASSIGN" },
        orderBy: { triggeredAt: "desc" },
      });
      expect(manual).not.toBeNull();
      expect(manual!.triggeredByEvent).toBe("ADMIN_MANUAL_REASSIGN");

      const ev = await prisma.recordEvent.findFirst({
        where: { recordId: record.id, eventType: "FINANCE_REASSIGNED" },
        orderBy: { occurredAt: "desc" },
      });
      expect(ev).not.toBeNull();
    });

    it("Evaluation mode: clears assignee then engine runs with ADMIN_MANUAL_REEVALUATION", async () => {
      const label = `c10-eval-${Date.now()}`;
      const { record } = await createTeamRuleRecord(label);
      const { evaluateAndAssign } = await import("@/server/services/finance-assignment-engine/index");
      await evaluateAndAssign({
        tenantId: tenantAId,
        recordId: record.id,
        triggerEvent: "TEST",
        triggeredByUserId: userAId,
      });

      setMockSession(mockAppSession(userAId));
      const { POST: POST_REASSIGN } = await import(
        "@/app/api/finance/assignments/[recordId]/reassign/route"
      );
      const res = await POST_REASSIGN(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ recordId: record.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.mode).toBe("EVALUATION");
      expect(body.data.engineOutcome).not.toBe("ENGINE_ERROR");

      const reEval = await prisma.financeAssignmentEvaluation.findFirst({
        where: { recordId: record.id, triggeredByEvent: "ADMIN_MANUAL_REEVALUATION" },
        orderBy: { triggeredAt: "desc" },
      });
      expect(reEval).not.toBeNull();
    });

    it("cross-tenant: reassign returns 404 for tenant B admin on tenant A record", async () => {
      const label = `c10-iso-${Date.now()}`;
      const { record } = await createTeamRuleRecord(label);
      setMockSession(mockAppSession(userBId));
      const { POST: POST_REASSIGN } = await import(
        "@/app/api/finance/assignments/[recordId]/reassign/route"
      );
      const res = await POST_REASSIGN(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ recordId: record.id }) }
      );
      expect(res.status).toBe(404);
    });
  });
});
