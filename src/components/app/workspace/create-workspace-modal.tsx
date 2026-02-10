"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { normalizeSlug } from "@/lib/validations";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { getApiErrorMessage } from "@/lib/api-client";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when user creates a workspace; redirects to workspace settings. */
  onCloseAfterCreate?: () => void;
};

export function CreateWorkspaceModal({ open, onClose, onCloseAfterCreate }: Props) {
  const apiFetch = useApiFetch();
  const [slug, setSlug] = useState("");
  const [createStatus, setCreateStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset form whenever the modal is opened so it’s always empty
  useEffect(() => {
    if (open) {
      setSlug("");
      setCreateError(null);
      setCreateStatus("idle");
    }
  }, [open]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateStatus("submitting");
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
      setCreateError("Workspace URL is required.");
      setCreateStatus("error");
      return;
    }
    try {
      const res = await apiFetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: normalizedSlug }),
      });
      const data = (await res.json()) as { data?: { tenant?: Tenant }; error?: string; message?: string };
      if (!res.ok) {
        setCreateError(getApiErrorMessage(res, data));
        setCreateStatus("error");
        return;
      }
      const created = data.data?.tenant;
      if (!created) {
        setCreateError("Invalid response.");
        setCreateStatus("error");
        return;
      }
      // Switch to the new workspace (set as default)
      const hasDefault = await apiFetch("/api/tenant", { showToastOnError: false }).then(async (r) => {
        const j = await r.json();
        const tenants = (j.data as { tenants?: { id: string; isDefaultTenant: boolean }[] })?.tenants ?? [];
        return tenants.some((t) => t.isDefaultTenant && t.id === created.id);
      });
      if (!hasDefault) {
        await apiFetch("/api/tenant", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: created.id }),
        });
      }
      // Close modal first (no setState before this) so it disappears immediately; then redirect.
      onClose();
      queueMicrotask(() => onCloseAfterCreate?.());
    } catch {
      setCreateError("Something went wrong. Please try again.");
      setCreateStatus("error");
    }
  };

  const handleClose = () => {
    setSlug("");
    setCreateError(null);
    setCreateStatus("idle");
    onClose();
  };

  const isSubmitting = createStatus === "submitting";
  const title = "Create workspace";
  const description = undefined;

  return (
    <Dialog
      open={open}
      onClose={() => handleClose()}
      title={title}
      description={description}
      closeDisabled={isSubmitting}
    >
      <form onSubmit={handleCreateSubmit} className="space-y-4">
        <div>
          <label htmlFor="workspace-slug" className="block text-sm font-medium text-(--text-primary)">
            Workspace URL
          </label>
          <input
            id="workspace-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. acme-inc"
            maxLength={80}
            disabled={createStatus === "submitting"}
            autoFocus
            className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
            aria-invalid={!!createError}
          />
          <p className="mt-1 text-xs text-(--text-muted)">
            Lowercase letters, numbers, and hyphens only.
          </p>
        </div>
        {createError ? (
          <div role="alert" className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)">
            {createError}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => handleClose()}
            disabled={createStatus === "submitting"}
            className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60 disabled:pointer-events-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createStatus === "submitting" || !normalizeSlug(slug)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {createStatus === "submitting" ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
