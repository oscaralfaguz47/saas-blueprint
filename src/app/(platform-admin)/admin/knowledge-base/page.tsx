import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { KnowledgeBaseAdminDashboard } from "@/components/app/admin/knowledge-base-admin-dashboard";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgeBasePage() {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canView = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.knowledge_base.read",
  });
  if (!canView) notFound();

  const canManage = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.knowledge_base.manage",
  });

  const [articleCount, publishedCount, draftCount, archivedCount, categoryCount] =
    await Promise.all([
      prisma.knowledgeBaseArticle.count(),
      prisma.knowledgeBaseArticle.count({ where: { status: "PUBLISHED" } }),
      prisma.knowledgeBaseArticle.count({ where: { status: "DRAFT" } }),
      prisma.knowledgeBaseArticle.count({ where: { status: "ARCHIVED" } }),
      prisma.knowledgeBaseCategory.count(),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">Knowledge Base</h1>
      <p className="mt-1 text-sm text-(--text-muted)">Manage categories and articles for Help and support.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Articles (total)", value: articleCount },
          { label: "Published", value: publishedCount },
          { label: "Draft", value: draftCount },
          { label: "Archived", value: archivedCount },
          { label: "Categories", value: categoryCount },
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
      <KnowledgeBaseAdminDashboard canManage={canManage} />
    </div>
  );
}
