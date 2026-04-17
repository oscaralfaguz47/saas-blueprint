"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

type WorkspaceUser = {
  user: { id: string; name: string | null; email: string | null };
  roles: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  onSuccess: () => void;
};

export function AssignApproverModal({ open, onClose, recordId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<"APPROVER" | "VIEWER">("APPROVER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workspace members when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    apiFetch("/api/tenant/users?context=assignment", { showToastOnError: false })
      .then((r) => r.json())
      .then((json: { data?: { users?: WorkspaceUser[] } }) => {
        setUsers(json.data?.users ?? []);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open, apiFetch]);

  function handleClose() {
    setSelectedUserId("");
    setRole("APPROVER");
    setError(null);
    onClose();
  }

  const userOptions = users
    .filter((u) => u.user.id)
    .map((u) => ({
      value: u.user.id,
      label: u.user.name
        ? `${u.user.name} (${u.user.email ?? ""})`
        : (u.user.email ?? u.user.id),
    }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) {
      setError("Please select a team member.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, participantRole: role }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { alreadyAssigned?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to assign approver.");
        return;
      }
      if (json.data?.alreadyAssigned) {
        toast.addToast("success", "Already assigned.");
      } else {
        toast.addToast("success", "Approver assigned.");
      }
      handleClose();
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Assign approver"
      description="Select a team member to assign as approver for this request."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}

        {/* People picker */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Team member <span className="text-(--color-danger)">*</span>
          </label>
          {loadingUsers ? (
            <div className="flex h-10 items-center gap-2 text-sm text-(--text-muted)">
              <Spinner size="sm" />
              Loading team members…
            </div>
          ) : userOptions.length === 0 ? (
            <p className="text-sm text-(--text-muted)">No team members found.</p>
          ) : (
            <SearchableSelect
              options={userOptions}
              value={selectedUserId}
              onChange={setSelectedUserId}
              placeholder="Search by name or email…"
            />
          )}
        </div>

        {/* Role selector */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">Role</label>
          <div className="flex gap-2">
            {(["APPROVER", "VIEWER"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={[
                  "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  role === r
                    ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                    : "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-secondary) hover:bg-(--bg-surface-hover)",
                ].join(" ")}
              >
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <p className="text-xs text-(--text-muted)">
            {role === "APPROVER"
              ? "Approvers can approve or reject this request."
              : "Viewers can see the request but cannot approve."}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !selectedUserId || loadingUsers}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Assigning…" : "Assign"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
