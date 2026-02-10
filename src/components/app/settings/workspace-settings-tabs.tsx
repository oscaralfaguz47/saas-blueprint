"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { WorkspaceGeneralTab } from "./workspace-general-tab";
import { WorkspaceMembersTab } from "./workspace-members-tab";
import { WorkspaceInvitesTab } from "./workspace-invites-tab";

export type WorkspaceSettingsTab = "general" | "members" | "invites" | "billing";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoObjectKey?: string | null;
  timezone?: string | null;
  currency?: string | null;
  dateFormat?: string | null;
  description?: string | null;
};

type Props = {
  tenant: Tenant;
};

const TABS: { id: WorkspaceSettingsTab; label: string; href?: string }[] = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "invites", label: "Invites" },
  { id: "billing", label: "Billing", href: "/app/settings/billing" },
];

export function WorkspaceSettingsTabs({ tenant }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as WorkspaceSettingsTab) || "general";
  const effectiveTab = TABS.some((t) => t.id === tab) ? tab : "general";

  return (
    <Container>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-(--text-primary)">
          Workspace Settings
        </h1>

        <nav className="flex flex-wrap gap-1 border-b border-(--border-subtle)" aria-label="Settings sections">
          {TABS.map((t) => {
            const isActive = effectiveTab === t.id;
            const href = t.href ?? `/app/settings/workspace?tab=${t.id}`;
            const content = (
              <span
                className={
                  "inline-block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors " +
                  (isActive
                    ? "border-(--color-primary) text-(--color-primary)"
                    : "border-transparent text-(--text-secondary) hover:text-(--text-primary)")
                }
              >
                {t.label}
              </span>
            );
            if (t.href) {
              return (
                <Link key={t.id} href={href} className={isActive ? "cursor-default" : ""}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(href)}
                className={isActive ? "cursor-default" : ""}
              >
                {content}
              </button>
            );
          })}
        </nav>

        {effectiveTab === "general" && <WorkspaceGeneralTab tenant={tenant} />}
        {effectiveTab === "members" && <WorkspaceMembersTab tenant={tenant} />}
        {effectiveTab === "invites" && <WorkspaceInvitesTab tenant={tenant} />}
      </div>
    </Container>
  );
}
