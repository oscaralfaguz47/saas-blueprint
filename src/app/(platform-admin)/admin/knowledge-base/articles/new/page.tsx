import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { KbArticleEditorClient } from "@/components/app/admin/kb-article-editor-client";
import { authOptions } from "@/server/auth-options";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export const dynamic = "force-dynamic";

export default async function AdminKbArticleNewPage() {
  const session = await getServerSession(authOptions);
  const fullSession = await requireFullSessionRsc(session);

  const canRead = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.knowledge_base.read",
  });
  if (!canRead) notFound();

  const canManage = await hasVendorPermission({
    userId: fullSession.user.id,
    permission: "admin.knowledge_base.manage",
  });
  if (!canManage) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--text-primary)">New article</h1>
      <p className="mt-1 text-sm text-(--text-muted)">Create a help center article.</p>
      <div className="mt-6">
        <KbArticleEditorClient mode="new" canManage />
      </div>
    </div>
  );
}
