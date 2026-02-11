import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";
import { AppLayoutHydrationGate } from "@/components/app/app-layout-hydration-gate";

const PENDING_INVITE_COOKIE = "pending_invite_token";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");

  const userId = session.user.id;

  try {
    let membership = await getDefaultTenantForUser(userId);

    if (!membership) {
      const cookieStore = await cookies();
      const pendingToken = cookieStore.get(PENDING_INVITE_COOKIE)?.value;
      if (pendingToken && pendingToken.length >= 20) {
        const tokenHash = crypto
          .createHash("sha256")
          .update(pendingToken)
          .digest("hex");
        const invite = await prisma.tenantInvitation.findUnique({
          where: { tokenHash },
          select: { acceptedAt: true, revokedAt: true, expiresAt: true },
        });
        const now = new Date();
        if (
          invite &&
          !invite.acceptedAt &&
          !invite.revokedAt &&
          invite.expiresAt > now
        ) {
          redirect(`/invite?token=${encodeURIComponent(pendingToken)}`);
        }
      }

      await ensureDraftWorkspaceForUser({
        userId,
        userEmail: session.user.email ?? undefined,
      });
      redirect("/setup/workspace");
    }

    if (membership.tenant.status === "DRAFT") {
      redirect("/setup/workspace");
    }

    const tenantId = membership.tenant.id;
    const workspace = {
      id: membership.tenant.id,
      name: membership.tenant.name,
      logoObjectKey: membership.tenant.logoObjectKey ?? null,
    };

    return (
      <AppLayoutHydrationGate
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
        }}
        workspace={workspace}
        tenantId={tenantId}
      >
        {children}
      </AppLayoutHydrationGate>
    );
  } catch (error) {
    // Next.js redirect() throws a special error; rethrow so the redirect is honored
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("AppLayout data fetch error:", error);
    redirect("/api/auth/signout?callbackUrl=/auth/sign-in");
  }
}
