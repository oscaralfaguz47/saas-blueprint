import { getServerSession } from "next-auth";
import { SupportTicketType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function AdminChatSessionDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canView = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.support.read",
  });
  if (!canView) notFound();

  const { sessionId } = await params;

  const row = await prisma.aiChatSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row) notFound();

  const articleIds = Array.from(new Set(row.messages.flatMap((m) => m.citedArticleIds ?? [])));
  const articles =
    articleIds.length > 0
      ? await prisma.knowledgeBaseArticle.findMany({
          where: { id: { in: articleIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  const visitorTickets =
    row.visitorEmail && !row.isAuthenticated
      ? await prisma.supportTicket.findMany({
          where: {
            ticketType: SupportTicketType.SALES_INQUIRY,
            requesterEmail: row.visitorEmail,
          },
          select: { id: true, subject: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [];

  return (
    <div>
      <Link href="/admin/chat" className="text-sm text-(--color-primary) hover:underline">
        ← Chat History
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-(--text-primary)">Session</h1>
      <p className="mt-1 font-mono text-xs text-(--text-muted)">{row.id}</p>

      <div className="mt-6 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4 text-sm">
        <p>
          <span className="text-(--text-muted)">Type:</span>{" "}
          {row.isAuthenticated ? "Authenticated" : "Visitor"}
        </p>
        {row.user?.email ? (
          <p>
            <span className="text-(--text-muted)">User:</span> {row.user.email}{" "}
            <span className="font-mono text-xs">({row.userId})</span>
          </p>
        ) : null}
        {row.visitorEmail ? (
          <p>
            <span className="text-(--text-muted)">Visitor email:</span> {row.visitorEmail}
          </p>
        ) : null}
        <p>
          <span className="text-(--text-muted)">Messages:</span> {row.messageCount}
        </p>
        <p>
          <span className="text-(--text-muted)">Started:</span> {row.startedAt.toLocaleString()}
        </p>
      </div>

      {visitorTickets.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-(--text-primary)">Related sales inquiries</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {visitorTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/support?highlight=${t.id}`}
                  className="text-(--color-primary) hover:underline"
                >
                  {t.subject}
                </Link>{" "}
                <span className="text-(--text-muted)">({t.id.slice(0, 8)}…)</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-(--text-primary)">Conversation</h2>
        {row.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border border-(--border-subtle) px-4 py-3 text-sm ${
              m.role === "USER" ? "bg-(--nav-active)/30 ml-8" : "mr-8 bg-(--bg-surface)"
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-(--text-muted)">
              <span className="font-medium">{m.role}</span>
              <span>{m.createdAt.toLocaleString()}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-(--text-primary)">{m.content}</p>
            {m.role === "ASSISTANT" && (m.citedArticleIds?.length ?? 0) > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-(--border-subtle) pt-2">
                {(m.citedArticleIds ?? []).map((id) => {
                  const a = articleMap.get(id);
                  if (!a) return null;
                  return (
                    <Link
                      key={id}
                      href={`/help/article/${a.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-(--border-subtle) px-2 py-0.5 text-xs text-(--color-primary)"
                    >
                      {a.title}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Link href="/admin/support" className="text-sm font-medium text-(--color-primary) hover:underline">
          View Support Tickets
        </Link>
      </div>
    </div>
  );
}
