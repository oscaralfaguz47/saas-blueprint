import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import InviteClient from "./invite-client";

// Force dynamic rendering - this page uses client-side hooks and search params
export const dynamic = "force-dynamic";

function InviteFallback() {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6 text-center">
          <p className="text-sm text-(--text-secondary)">Loading invitation…</p>
        </div>
      </div>
    </main>
  );
}

export default async function InvitePage() {
  let hasActiveWorkspace = false;
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const activeMembership = await prisma.tenantMembership.findFirst({
      where: {
        userId: session.user.id,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    hasActiveWorkspace = !!activeMembership;
  }

  return (
    <Suspense fallback={<InviteFallback />}>
      <InviteClient hasActiveWorkspace={hasActiveWorkspace} />
    </Suspense>
  );
}
