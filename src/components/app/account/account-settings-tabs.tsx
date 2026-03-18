"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { AppearanceTab } from "./appearance-tab";
import { SecurityTab } from "./security-tab";

export type AccountTab = "profile" | "appearance" | "security";

export type AccountProfile = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  appearance: string;
  avatarUrl: string | null;
};

export type AccountSecurity = {
  totpEnabled: boolean;
  totpPendingSetup: boolean;
  autoLogoutEnabled: boolean;
  autoLogoutMinutes: number;
  backupCodesGeneratedAt: string | null;
};

const ALL_TABS: { id: AccountTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "security", label: "Security" },
];

type Props = {
  profile: AccountProfile;
  loginMethod: string;
  linkedProviders: string[];
  authLevel: string;
  security: AccountSecurity;
  currentUserEmail: string | null;
};

export function AccountSettingsTabs({
  profile,
  loginMethod,
  linkedProviders,
  authLevel,
  security,
  currentUserEmail,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = (searchParams.get("tab") as AccountTab) || "profile";
  const tabAllowed = ALL_TABS.some((t) => t.id === tabFromUrl);
  const effectiveTab = tabAllowed ? tabFromUrl : "profile";

  const [activeTab, setActiveTab] = useState<AccountTab>(effectiveTab);

  useEffect(() => {
    setActiveTab(effectiveTab);
  }, [effectiveTab]);

  if (!tabAllowed) {
    router.replace(`/app/account?tab=profile`);
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as AccountTab);
    router.push(`/app/account?tab=${value}`);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl font-semibold text-(--text-primary)">Account Settings</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {ALL_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab profile={profile} loginMethod={loginMethod} />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab initialMode={profile.appearance} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab
            security={security}
            linkedProviders={linkedProviders}
            authLevel={authLevel}
            currentUserEmail={currentUserEmail}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
