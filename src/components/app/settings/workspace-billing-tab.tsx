"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

/**
 * Billing tab content for Workspace Settings.
 * Same content as the standalone /app/settings/billing page, inlined in the tab.
 */
export function WorkspaceBillingTab() {
  const [loading] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-(--text-muted)">Loading billing…</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-(--text-primary)">Billing</h2>
      <p className="text-sm text-(--text-secondary)">
        Coming soon. This will show plan, invoices, and upgrades.
      </p>
    </div>
  );
}
