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
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { tenant: { select: { name: true } } },
  });

  return invite?.tenant?.name ?? null;
}

export default async function SetupWorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent("/setup/workspace")}`);
  }

  await ensureDraftWorkspaceForUser({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
  });

  const pendingInviteWorkspaceName = await getPendingInviteWorkspaceName(session.user.email);

  return <SetupWorkspaceClient pendingInviteWorkspaceName={pendingInviteWorkspaceName} />;
}
