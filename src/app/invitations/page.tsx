import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import InvitationsClient from "./invitations-client";

export const dynamic = "force-dynamic";

type WorkspaceItem = {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  isDefault: boolean;
  logoObjectKey: string | null;
};

type PendingInvitationItem = {
  id: string;
  tenantId: string;
  workspaceName: string;
  invitedAt: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string | null } | null;
};

export default async function InvitationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent("/invitations")}`);
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const emailNormalized = (
    session.user.email ?? userRecord?.email ?? ""
  ).trim().toLowerCase();
  const now = new Date();

  const [memberships, pendingInvitations] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: {
        userId: session.user.id,
        status: "ACTIVE",
        tenant: { status: { in: ["ACTIVE", "DRAFT"] } },
      },
      select: {
        tenantId: true,
        isDefaultTenant: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoObjectKey: true,
          },
        },
      },
      orderBy: [{ isDefaultTenant: "desc" }, { joinedAt: "desc" }],
    }),
    emailNormalized
      ? prisma.tenantInvitation.findMany({
          where: {
            email: { equals: emailNormalized, mode: "insensitive" },
            status: "PENDING",
            revokedAt: null,
            acceptedAt: null,
            expiresAt: { gt: now },
          },
          select: {
            id: true,
            tenantId: true,
            createdAt: true,
            expiresAt: true,
            tenant: { select: { name: true } },
            invitedByUser: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const activeWorkspaces: WorkspaceItem[] = memberships.map((m) => ({
    tenantId: m.tenant.id,
    name: m.tenant.name,
    slug: m.tenant.slug,
    status: m.tenant.status,
    isDefault: m.isDefaultTenant,
    logoObjectKey: m.tenant.logoObjectKey,
  }));

  const pending: PendingInvitationItem[] = pendingInvitations.map((inv) => ({
    id: inv.id,
    tenantId: inv.tenantId,
    workspaceName: inv.tenant.name,
    invitedAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt.toISOString(),
    invitedBy: inv.invitedByUser
      ? { name: inv.invitedByUser.name, email: inv.invitedByUser.email }
      : null,
  }));

  return (
    <InvitationsClient
      activeWorkspaces={activeWorkspaces}
      pendingInvitations={pending}
    />
  );
}
