"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
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
  onCloseAfterCreate?: () => void;
};

export function CreateWorkspaceModal({ open, onClose, onCloseAfterCreate }: Props) {
  const apiFetch = useApiFetch();
  const [name, setName] = useState("");
  const [createStatus, setCreateStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setCreateError(null);
      setCreateStatus("idle");
    }
  }, [open]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      setCreateError("Workspace name must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 80) {
      setCreateError("Workspace name must be 80 characters or less.");
      return;
    }
    setCreateStatus("submitting");
    try {
      const res = await apiFetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
        showToastOnError: false,
      });
      const data = (await res.json()) as {
        data?: { tenant?: Tenant };
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        const msg =
          data.error?.code === "CONFLICT"
            ? "You already have a workspace with that name. Choose another."
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
      // Switch to the new workspace (set as default) if needed
      const listRes = await apiFetch("/api/tenant", { showToastOnError: false });
      const listJson = await listRes.json();
      const tenants =
        (listJson.data as { tenants?: { id: string; isDefaultTenant: boolean }[] })?.tenants ?? [];
      const hasDefault = tenants.some((t) => t.isDefaultTenant && t.id === created.id);
      if (!hasDefault) {
        await apiFetch("/api/tenant", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: created.id }),
        });
      }
      onClose();
      queueMicrotask(() => onCloseAfterCreate?.());
    } catch {
      setCreateError("Something went wrong. Please try again.");
      setCreateStatus("error");
    }
  };

  const handleClose = () => {
    setName("");
    setCreateError(null);
    setCreateStatus("idle");
    onClose();
  };

  const isSubmitting = createStatus === "submitting";
  const canSubmit = name.trim().length >= 2;

  return (
    <Dialog
      open={open}
      onClose={() => handleClose()}
      title="Create workspace"
      description="Give your workspace a name. You can always change it later in Workspace settings."
      closeDisabled={isSubmitting}
    >
      <form onSubmit={handleCreateSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="workspace-name"
            className="mb-1 block text-xs font-medium text-(--text-secondary)"
          >
            Workspace name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, 80));
              setCreateError(null);
            }}
            placeholder="e.g. Acme Inc"
            maxLength={80}
            disabled={isSubmitting}
            autoFocus
            autoComplete="organization"
            className="h-11 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:ring-2 focus:ring-(--color-primary) focus:outline-none disabled:opacity-60"
            aria-describedby={createError ? "workspace-name-error" : undefined}
            aria-invalid={!!createError}
          />
          {createError && (
            <p
              id="workspace-name-error"
              className="mt-1 text-sm text-(--color-danger)"
              role="alert"
            >
              {createError}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => handleClose()}
            disabled={isSubmitting}
            className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:pointer-events-none disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {isSubmitting ? (
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
