"use client";

import { useEffect } from "react";

/**
 * Fires "workspace-ready" when the app layout has rendered with the current workspace.
 * Used by the user menu to hide the "Switching workspace…" overlay only after the
 * RSC refetch (from router.refresh()) has completed and the new tenant data is in.
 */
export function WorkspaceReadyNotifier({ tenantId }: { tenantId: string | null }) {
  useEffect(() => {
    if (tenantId) {
      window.dispatchEvent(new CustomEvent("workspace-ready", { detail: { tenantId } }));
    }
  }, [tenantId]);

  return null;
}
