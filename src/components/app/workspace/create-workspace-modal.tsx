"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { CLAIM_SLUG_MIN, CLAIM_SLUG_MAX } from "@/lib/validations";
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
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [createStatus, setCreateStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset form whenever the modal is opened so it’s always empty
  useEffect(() => {
    if (open) {
      setSlug("");
      setAvailable(null);
      setCreateError(null);
      setCreateStatus("idle");
    }
  }, [open]);

  async function checkAvailability() {
    const raw = slug.trim().toLowerCase();
    if (raw.length < CLAIM_SLUG_MIN) {
      setCreateError(`Enter at least ${CLAIM_SLUG_MIN} characters`);
      setAvailable(null);
      return;
    }
    setCreateError(null);
    setChecking(true);
    setAvailable(null);
    try {
      const res = await apiFetch(
        `/api/workspaces/check-slug?slug=${encodeURIComponent(raw)}`,
        { showToastOnError: false }
      );
      const json = await res.json();
      const data = json?.data ?? json;
      setAvailable(typeof data?.available === "boolean" ? data.available : null);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const raw = slug.trim().toLowerCase();
    if (!raw || raw.length < CLAIM_SLUG_MIN) {
      setCreateError(`Workspace URL must be at least ${CLAIM_SLUG_MIN} characters.`);
      return;
    }
    setCreateStatus("submitting");
    try {
      const res = await apiFetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: raw }),
      });
      const data = (await res.json()) as {
        data?: { tenant?: Tenant };
        error?: string;
        message?: string;
        details?: { code?: string; slug?: string };
      };
      if (!res.ok) {
        const msg =
          data.details?.code === "SLUG_TAKEN" || data.error === "CONFLICT"
            ? "This workspace URL is already taken. Choose another."
            : getApiErrorMessage(res, data);
        setCreateError(msg);
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
    setAvailable(null);
    setCreateError(null);
    setCreateStatus("idle");
    onClose();
  };

  const isSubmitting = createStatus === "submitting";
  const slugTrimmed = slug.trim().toLowerCase();
  const canSubmit = slugTrimmed.length >= CLAIM_SLUG_MIN && slugTrimmed.length <= CLAIM_SLUG_MAX;

  return (
    <Dialog
      open={open}
      onClose={() => handleClose()}
      title="Create workspace"
      description="Choose a URL for your workspace. You can use letters, numbers, and hyphens (3–80 characters)."
      closeDisabled={isSubmitting}
    >
      <form onSubmit={handleCreateSubmit} className="space-y-4">
        <div>
          <label htmlFor="workspace-slug" className="mb-1 block text-xs font-medium text-(--text-secondary)">
            Workspace URL
          </label>
          <div className="flex gap-2">
            <input
              id="workspace-slug"
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(
                  e.target.value
                    .replace(/[^a-zA-Z0-9-]/g, "")
                    .toLowerCase()
                    .slice(0, CLAIM_SLUG_MAX)
                );
                setAvailable(null);
                setCreateError(null);
              }}
              placeholder="my-workspace"
              minLength={CLAIM_SLUG_MIN}
              maxLength={CLAIM_SLUG_MAX}
              disabled={isSubmitting}
              autoFocus
              className="h-11 flex-1 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
              aria-describedby={
                createError ? "workspace-slug-error" : available !== null ? "workspace-slug-availability" : undefined
              }
              aria-invalid={!!createError}
            />
            <button
              type="button"
              onClick={checkAvailability}
              disabled={checking || isSubmitting || slugTrimmed.length < CLAIM_SLUG_MIN}
              className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checking ? <Spinner size="sm" /> : "Check"}
            </button>
          </div>
          {available === true && (
            <p id="workspace-slug-availability" className="mt-1 text-sm text-(--color-success)">
              Available
            </p>
          )}
          {available === false && (
            <p id="workspace-slug-availability" className="mt-1 text-sm text-(--color-danger)">
              Already taken
            </p>
          )}
          {createError ? (
            <p id="workspace-slug-error" className="mt-1 text-sm text-(--color-danger)" role="alert">
              {createError}
            </p>
          ) : null}
        </div>
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
            disabled={isSubmitting || !canSubmit}
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
