import ThemeSelect from "@/components/settings/theme-select";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-(--text-primary)">
          Settings
        </h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Manage preferences for your workspace and account.
        </p>
      </div>

      <ThemeSelect />
    </div>
  );
}
