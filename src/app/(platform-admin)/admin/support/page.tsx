import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import { SupportTicketsAdminClient } from "@/components/app/admin/support-tickets-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canView = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: fullSession.user.role,
    permission: "admin.support.read",
  });
  if (!canView) notFound();

  const [open, inProgress, waiting, closed] = await Promise.all([
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
    prisma.supportTicket.count({ where: { status: "WAITING_FOR_CUSTOMER" } }),
    prisma.supportTicket.count({ where: { status: "CLOSED" } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">Support</h1>
      <p className="mt-1 text-sm text-(--text-muted)">Global support operations across workspaces.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open", value: open },
          { label: "In progress", value: inProgress },
          { label: "Waiting for customer", value: waiting },
          { label: "Closed", value: closed },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4"
          >
            <div className="text-sm text-(--text-muted)">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-(--text-primary)">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SupportTicketsAdminClient />
      </div>
    </div>
  );
}
