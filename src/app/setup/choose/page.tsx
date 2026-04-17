import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getOnboardingCounts } from "@/server/services/onboarding";
import SetupChooseClient from "./setup-choose-client";

export const dynamic = "force-dynamic";

export type PendingInvitationItem = {
  id: string;
  workspaceName: string;
  invitedByName: string | null;
  invitedByEmail: string | null;
  roleOffered: string;
};

export default async function SetupChoosePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent("/setup/choose")}`);
  }

  const { activeMembershipCount, pendingInvitationsCount } =
    await getOnboardingCounts(session.user.id);
  if (activeMembershipCount > 0) redirect("/app/requests");
  if (pendingInvitationsCount === 0) redirect("/app/requests");

  const emailNormalized = (session.user.email ?? "").trim().toLowerCase();
  if (!emailNormalized) redirect("/app/requests");

  const now = new Date();
  const invitations = await prisma.tenantInvitation.findMany({
    where: {
      email: { equals: emailNormalized, mode: "insensitive" },
      status: "PENDING",
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      role: true,
      tenant: { select: { name: true } },
      invitedByUser: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const items: PendingInvitationItem[] = invitations.map((inv) => ({
    id: inv.id,
    workspaceName: inv.tenant.name,
    invitedByName: inv.invitedByUser?.name ?? null,
    invitedByEmail: inv.invitedByUser?.email ?? null,
    roleOffered: inv.role ?? "Member",
  }));

  return <SetupChooseClient invitations={items} />;
}
