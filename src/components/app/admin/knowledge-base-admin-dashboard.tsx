"use client";

import { KbAdminArticlesSection } from "./kb-admin-articles-section";
import { KbAdminCategoriesSection } from "./kb-admin-categories-section";

export function KnowledgeBaseAdminDashboard({ canManage }: { canManage: boolean }) {
  return (
    <>
      <KbAdminCategoriesSection canManage={canManage} />
      <KbAdminArticlesSection canManage={canManage} />
    </>
  );
}
