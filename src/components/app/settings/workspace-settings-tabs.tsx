"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  currentUserId: string;
  currentUserRole: string;
};

const ALL_TABS: { id: WorkspaceSettingsTab; label: string; permission: string }[] = [
  { id: "general", label: "General", permission: "tenant.settings.manage" },
  { id: "members", label: "Members", permission: "tenant.users.read" },
  { id: "invites", label: "Invites", permission: "tenant.users.read" },
  { id: "billing", label: "Billing", permission: "tenant.billing.manage" },
];

export function WorkspaceSettingsTabs({
  tenant,
  permissions,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const permSet = new Set(permissions);
  const visibleTabs = ALL_TABS.filter((t) => permSet.has(t.permission));
  const tabFromUrl = (searchParams.get("tab") as WorkspaceSettingsTab) || "general";
  const tabAllowed = visibleTabs.some((t) => t.id === tabFromUrl);
  const effectiveTab = tabAllowed ? tabFromUrl : visibleTabs[0]?.id ?? "general";

  const [activeTab, setActiveTab] = useState(effectiveTab);

  useEffect(() => {
    setActiveTab(effectiveTab);
  }, [effectiveTab]);

  if (!tabAllowed && visibleTabs.length > 0) {
    router.replace(`/app/settings/workspace?tab=${effectiveTab}`);
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as WorkspaceSettingsTab);
    router.push(`/app/settings/workspace?tab=${value}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-(--text-primary)">
        Workspace Settings
      </h1>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <WorkspaceGeneralTab tenant={tenant} />
        </TabsContent>
        <TabsContent value="members">
          <WorkspaceMembersTab
            tenant={tenant}
            permissions={permissions}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
          />
        </TabsContent>
        <TabsContent value="invites">
          <WorkspaceInvitesTab tenant={tenant} permissions={permissions} />
        </TabsContent>
        <TabsContent value="billing">
          <WorkspaceBillingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
