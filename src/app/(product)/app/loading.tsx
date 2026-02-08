import { Spinner } from "@/components/ui/spinner";

/**
 * Shown while app segment (dashboard, records, etc.) is loading.
 * E.g. when user navigates to /app/dashboard or after "Switch to" workspace.
 */
export default function AppLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-12 text-(--text-primary)">
      <Spinner size="lg" />
      <p className="text-sm text-(--text-muted)">Loading…</p>
    </div>
  );
}
