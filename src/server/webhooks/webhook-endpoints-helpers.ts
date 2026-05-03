import "server-only";

import type { Prisma } from "@prisma/client";
import { WebhookEndpointStatus } from "@prisma/client";
import { ApiErrors } from "@/lib/api-response";
import { evaluateWebhooksPlanGate } from "@/lib/validations/webhook-plan-gate";
import { prisma } from "@/server/db";
import { resolveTenantPlan } from "@/server/billing/resolve-tenant-plan";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import type { NextResponse } from "next/server";

export type WebhookEndpointAuditSnapshot = {
  name: string;
  description: string | null;
  url: string;
  subscribedEvents: string[];
  status: WebhookEndpointStatus;
};

export function parseSubscribedEventsJson(j: Prisma.JsonValue): string[] {
  if (!Array.isArray(j)) return [];
  return j.filter((x): x is string => typeof x === "string");
}

export function snapshotFromRow(r: {
  name: string;
  description: string | null;
  url: string;
  subscribedEvents: Prisma.JsonValue;
  status: WebhookEndpointStatus;
}): WebhookEndpointAuditSnapshot {
  return {
    name: r.name,
    description: r.description,
    url: r.url,
    subscribedEvents: parseSubscribedEventsJson(r.subscribedEvents),
    status: r.status,
  };
}

export function mapPublicWebhookEndpoint(r: {
  id: string;
  name: string;
  description: string | null;
  url: string;
  subscribedEvents: Prisma.JsonValue;
  secretHint: string;
  status: WebhookEndpointStatus;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  disabledAutoAt: Date | null;
  disabledAutoReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    url: r.url,
    subscribedEvents: parseSubscribedEventsJson(r.subscribedEvents),
    secretHint: r.secretHint,
    status: r.status,
    consecutiveFailures: r.consecutiveFailures,
    lastSuccessAt: r.lastSuccessAt,
    lastFailureAt: r.lastFailureAt,
    disabledAutoAt: r.disabledAutoAt,
    disabledAutoReason: r.disabledAutoReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

const endpointPublicSelect = {
  id: true,
  name: true,
  description: true,
  url: true,
  subscribedEvents: true,
  secretHint: true,
  status: true,
  consecutiveFailures: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  disabledAutoAt: true,
  disabledAutoReason: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export { endpointPublicSelect };

export async function requireTenantWebhookManager(sessionUserId: string): Promise<
  | { error: NextResponse; tenant: null }
  | { error: null; tenant: { id: string } }
> {
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { isPlatformBlocked: true },
  });
  if (!user) return { error: ApiErrors.UNAUTHENTICATED(), tenant: null };
  if (user.isPlatformBlocked) return { error: ApiErrors.FORBIDDEN(), tenant: null };

  const membership = await getDefaultTenantForUser(sessionUserId);
  const tenant = membership?.tenant;
  if (!tenant) return { error: ApiErrors.NO_TENANT(), tenant: null };

  const allowed = await hasTenantPermission({
    userId: sessionUserId,
    tenantId: tenant.id,
    permission: "tenant.webhooks.manage",
  });
  if (!allowed) return { error: ApiErrors.FORBIDDEN(), tenant: null };

  return { error: null, tenant };
}

export async function assertOutboundWebhooksPlan(tenantId: string): Promise<NextResponse | null> {
  const plan = await resolveTenantPlan(tenantId);
  const gate = evaluateWebhooksPlanGate(plan.features);
  if (!gate.ok) {
    return ApiErrors.UPGRADE_REQUIRED(
      "Outbound webhooks require an eligible plan."
    );
  }
  return null;
}

export function webhookUrlValidationMessage(
  reason:
    | "invalid_url"
    | "non_https"
    | "host_forbidden"
    | "dns_failed"
    | "dns_timeout"
    | "ip_forbidden"
): string {
  switch (reason) {
    case "invalid_url":
      return "Enter a valid HTTPS webhook URL.";
    case "non_https":
      return "Webhook URL must use HTTPS.";
    case "host_forbidden":
    case "ip_forbidden":
      return "Webhook URL must use a public endpoint.";
    case "dns_failed":
    case "dns_timeout":
      return "Webhook URL host could not be resolved.";
    default:
      return "Webhook URL is not allowed.";
  }
}
