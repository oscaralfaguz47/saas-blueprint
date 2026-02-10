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
  permissions: string[];
};

const ALL_TABS: { id: WorkspaceSettingsTab; label: string; permission: string }[] = [
  { id: "general", label: "General", permission: "tenant.settings.manage" },
  { id: "members", label: "Members", permission: "tenant.users.read" },
  { id: "invites", label: "Invites", permission: "tenant.users.read" },
  { id: "billing", label: "Billing", permission: "tenant.billing.manage" },
];

export function WorkspaceSettingsTabs({ tenant, permissions }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const permSet = new Set(permissions);
  const visibleTabs = ALL_TABS.filter((t) => permSet.has(t.permission));
  const tab = (searchParams.get("tab") as WorkspaceSettingsTab) || "general";
  const tabAllowed = visibleTabs.some((t) => t.id === tab);
  const effectiveTab = tabAllowed ? tab : visibleTabs[0]?.id ?? "general";

  if (!tabAllowed && visibleTabs.length > 0) {
    router.replace(`/app/settings/workspace?tab=${effectiveTab}`);
  }

  return (
    <div className="space-y-6">
        <h1 className="text-xl font-semibold text-(--text-primary)">
          Workspace Settings
        </h1>

        <nav className="flex flex-wrap gap-1 border-b border-(--border-subtle)" aria-label="Settings sections">
          {visibleTabs.map((t) => {
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
        {effectiveTab === "members" && (
          <WorkspaceMembersTab tenant={tenant} permissions={permissions} />
        )}
        {effectiveTab === "invites" && (
          <WorkspaceInvitesTab tenant={tenant} permissions={permissions} />
        )}
        {effectiveTab === "billing" && <WorkspaceBillingTab />}
      </div>
  );
}
