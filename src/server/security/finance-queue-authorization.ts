import "server-only";

import type { NextResponse } from "next/server";
import { cache } from "react";
import { ApiErrors } from "@/lib/api-response";
import { prisma } from "@/server/db";

/**
 * Returns true if the user's TenantMembership is currently assigned to the record.
 * Auth is orthogonal to financeStatus — handlers check status separately.
 *
 * Per-render cache for dedup within a single request (mirror feature-flags.ts).
 */
async function loadIsAssignedToCurrentUser(
  tenantId: string,
  userId: string,
  recordId: string
): Promise<boolean> {
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE") return false;

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { financeAssignedMembershipId: true },
  });
  if (!record) return false;

  return record.financeAssignedMembershipId === membership.id;
}

const cachedLoadIsAssignedToCurrentUser = cache(loadIsAssignedToCurrentUser);

export async function isAssignedToCurrentUser(args: {
  tenantId: string;
  userId: string;
  recordId: string;
}): Promise<boolean> {
  return cachedLoadIsAssignedToCurrentUser(args.tenantId, args.userId, args.recordId);
}

/**
 * Resolves the active membership for (tenantId, userId). Returns 404 when the record
 * is not in this tenant (concealment). Returns 403 when the user is not the assignee.
 */
export async function requireFinanceQueueAssignee(params: {
  tenantId: string;
  userId: string;
  recordId: string;
}): Promise<
  { ok: true; membershipId: string } | { ok: false; response: NextResponse }
> {
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: params.tenantId, userId: params.userId } },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, response: ApiErrors.FORBIDDEN() };
  }

  const record = await prisma.record.findFirst({
    where: { id: params.recordId, tenantId: params.tenantId },
    select: { financeAssignedMembershipId: true },
  });
  if (!record) {
    return { ok: false, response: ApiErrors.NOT_FOUND("Record") };
  }
  if (record.financeAssignedMembershipId !== membership.id) {
    return { ok: false, response: ApiErrors.FORBIDDEN() };
  }

  return { ok: true, membershipId: membership.id };
}
