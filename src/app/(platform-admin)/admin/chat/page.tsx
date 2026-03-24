import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { AdminChatHistoryClient } from "@/components/app/admin/admin-chat-history-client";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export const dynamic = "force-dynamic";

export default async function AdminChatHistoryPage() {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canView = await hasVendorPermission({
    userId: fullSession.user.id,
    legacyRole: fullSession.user.role,
    permission: "admin.support.read",
  });
  if (!canView) notFound();

  const [totalSessions, authenticatedSessions, visitorSessions, totalMessages] = await Promise.all([
    prisma.aiChatSession.count(),
    prisma.aiChatSession.count({ where: { isAuthenticated: true } }),
    prisma.aiChatSession.count({ where: { isAuthenticated: false } }),
    prisma.aiChatMessage.count(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">Chat History</h1>
      <p className="mt-1 text-sm text-(--text-muted)">AI Help Assistant sessions and messages.</p>
      <div className="mt-8">
        <AdminChatHistoryClient
          summary={{
            totalSessions,
            authenticatedSessions,
            visitorSessions,
            totalMessages,
          }}
        />
      </div>
    </div>
  );
}
