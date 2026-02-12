import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";
import SetupWorkspaceClient from "./setup-workspace-client";

export const dynamic = "force-dynamic";

/** One pending invite for setup/workspace: show Accept/Decline. */
export type PendingInvitationForSetup = {
  id: string;
  workspaceName: string;
  invitedByName: string | null;
  invitedByEmail: string | null;
};

/**
 * Look up all valid pending invites for this user's email (server-side only).
 * Used to show Accept/Decline for each on the claim page.
 */
async function getPendingInvitations(
  userEmail: string | null | undefined
): Promise<PendingInvitationForSetup[]> {
  if (!userEmail || typeof userEmail !== "string") return [];
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) return [];

  const invites = await prisma.tenantInvitation.findMany({
    where: {
      email: { equals: normalized, mode: "insensitive" },
      status: "PENDING",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      tenant: { select: { name: true } },
      invitedByUser: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return invites.map((inv) => ({
    id: inv.id,
    workspaceName: inv.tenant.name,
    invitedByName: inv.invitedByUser?.name ?? null,
    invitedByEmail: inv.invitedByUser?.email ?? null,
  }));
}

/**
 * When user has no active workspace but has at least one DISABLED membership,
 * return the name of the most recent such workspace (so we can show "You are no longer active in [Name]").
 * Returns null for brand-new users who have never been in a workspace.
 */
async function getLastInactiveWorkspaceName(userId: string): Promise<string | null> {
  const disabled = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      status: "DISABLED",
      tenant: { status: "ACTIVE" },
    },
    orderBy: { joinedAt: "desc" },
    select: { tenant: { select: { name: true } } },
  });
  return disabled?.tenant?.name ?? null;
}

export default async function SetupWorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent("/setup/workspace")}`);
  }

  // Only redirect to app when user has an ACTIVE workspace (re-enabled flow).
  // Do not redirect when their only membership is a DRAFT (avoids loop: /app → DRAFT → /setup/workspace → 1 membership → /app).
  const defaultMembership = await getDefaultTenantForUser(session.user.id);
  if (defaultMembership?.tenant.status === "ACTIVE") {
    redirect("/app");
  }

  try {
    await ensureDraftWorkspaceForUser({
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "USER_NOT_FOUND") {
      redirect(
        `/auth/sign-out?callbackUrl=${encodeURIComponent("/auth/sign-in?error=SessionExpired")}`
      );
    }
    throw err;
  }

  const [pendingInvitations, lastInactiveWorkspaceName] = await Promise.all([
    getPendingInvitations(session.user.email),
    getLastInactiveWorkspaceName(session.user.id),
  ]);

  return (
    <SetupWorkspaceClient
      pendingInvitations={pendingInvitations}
      lastInactiveWorkspaceName={lastInactiveWorkspaceName}
    />
  );
}
