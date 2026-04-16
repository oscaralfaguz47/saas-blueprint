"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { SecurityTab } from "./security-tab";

export type AccountTab = "profile" | "security";

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
  { id: "security", label: "Security" },
];

type Props = {
  profile: AccountProfile;
  linkedProviders: string[];
  authLevel: string;
  security: AccountSecurity;
  currentUserEmail: string | null;
  vendorSetup2fa?: boolean;
};

export function AccountSettingsTabs({
  profile,
  linkedProviders,
  authLevel,
  security,
  currentUserEmail,
  vendorSetup2fa = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vendorSetupBannerDismissed, setVendorSetupBannerDismissed] = useState(false);

  const rawTab = searchParams.get("tab") as AccountTab | null;
  const tabIsValid = rawTab != null && ALL_TABS.some((t) => t.id === rawTab);
  const defaultTab: AccountTab =
    vendorSetup2fa && !security.totpEnabled ? "security" : "profile";
  const effectiveTab: AccountTab = tabIsValid ? rawTab! : defaultTab;

  const [activeTab, setActiveTab] = useState<AccountTab>(effectiveTab);

  useEffect(() => {
    setActiveTab(effectiveTab);
  }, [effectiveTab]);

  useEffect(() => {
    if (!tabIsValid && rawTab != null) {
      const qs = vendorSetup2fa ? "tab=security&vendorSetup2fa=1" : "tab=profile";
      router.replace(`/app/account?${qs}`);
    }
  }, [tabIsValid, rawTab, vendorSetup2fa, router]);

  useEffect(() => {
    if (!vendorSetup2fa || security.totpEnabled) return;
    if (!searchParams.get("tab")) {
      router.replace(`/app/account?tab=security&vendorSetup2fa=1`);
    }
  }, [vendorSetup2fa, security.totpEnabled, searchParams, router]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as AccountTab);
    const vs = vendorSetup2fa ? "&vendorSetup2fa=1" : "";
    router.push(`/app/account?tab=${value}${vs}`);
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
          <ProfileTab profile={profile} />
        </TabsContent>
        <TabsContent value="security">
          {vendorSetup2fa && !security.totpEnabled && !vendorSetupBannerDismissed && (
            <div className="relative mb-4 rounded-lg border border-amber-400 bg-amber-400/15 p-4 pr-14">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                2FA required for Platform Admin access
              </p>
              <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
                You have been granted platform admin access. Two-factor authentication is
                required before you can access the admin area. Set it up below.
              </p>
              <button
                type="button"
                onClick={() => setVendorSetupBannerDismissed(true)}
                className="absolute right-3 top-3 text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
              >
                Dismiss
              </button>
            </div>
          )}
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
