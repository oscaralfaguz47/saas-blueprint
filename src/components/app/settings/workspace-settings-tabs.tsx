"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { WorkspaceGeneralTab } from "./workspace-general-tab";
import { WorkspaceMembersTab } from "./workspace-members-tab";
import { WorkspaceInvitesTab } from "./workspace-invites-tab";
import { WorkspaceBillingTab } from "./workspace-billing-tab";

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

const TABS: { id: WorkspaceSettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "invites", label: "Invites" },
  { id: "billing", label: "Billing" },
];

export function WorkspaceSettingsTabs({ tenant }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as WorkspaceSettingsTab) || "general";
  const effectiveTab = TABS.some((t) => t.id === tab) ? tab : "general";

  return (
    <div className="space-y-6">
        <h1 className="text-xl font-semibold text-(--text-primary)">
          Workspace Settings
        </h1>

        <nav className="flex flex-wrap gap-1 border-b border-(--border-subtle)" aria-label="Settings sections">
          {TABS.map((t) => {
            const isActive = effectiveTab === t.id;
            const href = `/app/settings/workspace?tab=${t.id}`;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(href)}
                className={isActive ? "cursor-default" : ""}
              >
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
              </button>
            );
          })}
        </nav>

        {effectiveTab === "general" && <WorkspaceGeneralTab tenant={tenant} />}
        {effectiveTab === "members" && <WorkspaceMembersTab tenant={tenant} />}
        {effectiveTab === "invites" && <WorkspaceInvitesTab tenant={tenant} />}
        {effectiveTab === "billing" && <WorkspaceBillingTab />}
      </div>
  );
}
