import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";
import SetupWorkspaceClient from "./setup-workspace-client";

export const dynamic = "force-dynamic";

/**
 * Look up a valid pending invite for this user's email (server-side only).
 * Returns at most one workspace name for UX; no tokens or invite IDs exposed.
 */
async function getPendingInviteWorkspaceName(userEmail: string | null | undefined): Promise<string | null> {
  if (!userEmail || typeof userEmail !== "string") return null;
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) return null;

  const invite = await prisma.tenantInvitation.findFirst({
    where: {
      email: { equals: normalized, mode: "insensitive" },
      status: "PENDING",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { tenant: { select: { name: true } } },
  });

  return invite?.tenant?.name ?? null;
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

  const [pendingInviteWorkspaceName, lastInactiveWorkspaceName] = await Promise.all([
    getPendingInviteWorkspaceName(session.user.email),
    getLastInactiveWorkspaceName(session.user.id),
  ]);

  return (
    <SetupWorkspaceClient
      pendingInviteWorkspaceName={pendingInviteWorkspaceName}
      lastInactiveWorkspaceName={lastInactiveWorkspaceName}
    />
  );
}
