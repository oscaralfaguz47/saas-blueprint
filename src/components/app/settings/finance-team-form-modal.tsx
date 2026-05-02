"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

export type FinanceTeamListItem = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  isActive: boolean;
  timeZone: string | null;
  maxConcurrentAssignments: number | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type DepartmentOption = { id: string; name: string };

type TeamFormBaseline = {
  name: string;
  description: string | null;
  departmentId: string | null;
  isActive: boolean;
  timeZone: string | null;
  maxConcurrentAssignments: number | null;
};

export function computeTeamPatch(
  initial: TeamFormBaseline,
  form: TeamFormBaseline,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  if (form.name !== initial.name) diff.name = form.name;
  const d0 = initial.description ?? null;
  const d1 = form.description ?? null;
  if (d0 !== d1) diff.description = form.description === "" || form.description == null ? null : form.description;
  const dep0 = initial.departmentId ?? null;
  const dep1 = form.departmentId ?? null;
  if (dep0 !== dep1) diff.departmentId = dep1;
  if (form.isActive !== initial.isActive) diff.isActive = form.isActive;
  const tz0 = initial.timeZone ?? null;
  const tz1 = form.timeZone ?? null;
  if (tz0 !== tz1) diff.timeZone = form.timeZone === "" || form.timeZone == null ? null : form.timeZone;
  const m0 = initial.maxConcurrentAssignments ?? null;
  const m1 = form.maxConcurrentAssignments ?? null;
  if (m0 !== m1) {
    diff.maxConcurrentAssignments =
      form.maxConcurrentAssignments === null || form.maxConcurrentAssignments === undefined
        ? null
        : form.maxConcurrentAssignments;
  }
  return diff;
}

function baselineFromTeam(t: FinanceTeamListItem): TeamFormBaseline {
  return {
    name: t.name,
    description: t.description,
    departmentId: t.departmentId,
    isActive: t.isActive,
    timeZone: t.timeZone,
    maxConcurrentAssignments: t.maxConcurrentAssignments,
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  team: FinanceTeamListItem | null;
  departmentOptions: DepartmentOption[];
  onSuccess: (team: FinanceTeamListItem) => void;
};

export function FinanceTeamFormModal({
  open,
  onClose,
  mode,
  team,
  departmentOptions,
  onSuccess,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [timeZone, setTimeZone] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<TeamFormBaseline | null>(null);

  const deptSelectOptions = [
    { value: "", label: "No department" },
    ...departmentOptions.map((d) => ({ value: d.id, label: d.name })),
  ];

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && team) {
      const b = baselineFromTeam(team);
      setBaseline(b);
      setName(b.name);
      setDescription(b.description ?? "");
      setDepartmentId(b.departmentId ?? "");
      setIsActive(b.isActive);
      setTimeZone(b.timeZone ?? "");
      setMaxConcurrent(
        b.maxConcurrentAssignments != null ? String(b.maxConcurrentAssignments) : "",
      );
    } else {
      setBaseline(null);
      setName("");
      setDescription("");
      setDepartmentId("");
      setIsActive(true);
      setTimeZone("");
      setMaxConcurrent("");
    }
  }, [open, mode, team?.id, team?.updatedAt]);

  const formBaseline = (): TeamFormBaseline => ({
    name: name.trim(),
    description: description.trim() === "" ? null : description.trim(),
    departmentId: departmentId === "" ? null : departmentId,
    isActive,
    timeZone: timeZone.trim() === "" ? null : timeZone.trim(),
    maxConcurrentAssignments: (() => {
      const t = maxConcurrent.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    })(),
  });

  const handleCreate = useCallback(async () => {
    const n = name.trim();
    if (!n) {
      setError("Name is required.");
      return;
    }
    let maxVal: number | undefined;
    if (maxConcurrent.trim() !== "") {
      const num = Number(maxConcurrent.trim());
      if (!Number.isFinite(num) || num < 1 || num > 10000) {
        setError("Max concurrent assignments must be between 1 and 10000.");
        return;
      }
      maxVal = Math.floor(num);
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: n,
        isActive,
      };
      const desc = description.trim();
      if (desc) body.description = desc;
      if (departmentId) body.departmentId = departmentId;
      const tz = timeZone.trim();
      if (tz) body.timeZone = tz;
      if (maxVal !== undefined) body.maxConcurrentAssignments = maxVal;

      const res = await apiFetch("/api/tenant/finance-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: FinanceTeamListItem;
        error?: { message?: string; code?: string };
      };
      if (!res.ok) {
        if (res.status === 409) {
          setError("A finance team with this name already exists.");
          return;
        }
        setError(data.error?.message ?? "Could not create team.");
        return;
      }
      if (data.data) {
        toast.addToast("success", "Finance team created.");
        onSuccess(data.data);
        onClose();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }, [
    apiFetch,
    departmentId,
    description,
    isActive,
    maxConcurrent,
    name,
    onClose,
    onSuccess,
    timeZone,
    toast,
  ]);

  const handleEdit = useCallback(async () => {
    if (!team || !baseline) return;
    const n = name.trim();
    if (!n) {
      setError("Name is required.");
      return;
    }
    let maxVal: number | null | undefined;
    if (maxConcurrent.trim() === "") {
      maxVal = null;
    } else {
      const num = Number(maxConcurrent.trim());
      if (!Number.isFinite(num) || num < 1 || num > 10000) {
        setError("Max concurrent assignments must be between 1 and 10000.");
        return;
      }
      maxVal = Math.floor(num);
    }
    const form: TeamFormBaseline = {
      name: n,
      description: description.trim() === "" ? null : description.trim(),
      departmentId: departmentId === "" ? null : departmentId,
      isActive,
      timeZone: timeZone.trim() === "" ? null : timeZone.trim(),
      maxConcurrentAssignments: maxVal,
    };
    const patch = computeTeamPatch(baseline, form);
    if (Object.keys(patch).length === 0) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/finance-teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: FinanceTeamListItem;
        error?: { message?: string };
      };
      if (!res.ok) {
        if (res.status === 409) {
          setError("A finance team with this name already exists.");
          return;
        }
        if (res.status === 404) {
          setError("This team no longer exists.");
          return;
        }
        setError(data.error?.message ?? "Could not update team.");
        return;
      }
      if (data.data) {
        toast.addToast("success", "Finance team updated.");
        onSuccess(data.data);
        onClose();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }, [
    apiFetch,
    baseline,
    departmentId,
    description,
    isActive,
    maxConcurrent,
    name,
    onClose,
    onSuccess,
    team,
    timeZone,
    toast,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") void handleCreate();
    else void handleEdit();
  };

  const diffEmpty =
    mode === "edit" &&
    baseline != null &&
    Object.keys(computeTeamPatch(baseline, formBaseline())).length === 0;

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={mode === "create" ? "Create finance team" : "Edit finance team"}
      closeDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ft-name" className="block text-sm font-medium text-(--text-primary)">
            Name
          </label>
          <Input
            id="ft-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            disabled={submitting}
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <label htmlFor="ft-desc" className="block text-sm font-medium text-(--text-primary)">
            Description
          </label>
          <Textarea
            id="ft-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            disabled={submitting}
            rows={3}
            className="mt-1.5"
          />
        </div>
        <div>
          <span className="block text-sm font-medium text-(--text-primary)">Department</span>
          <SearchableSelect
            id="ft-dept"
            options={deptSelectOptions}
            value={departmentId}
            onChange={setDepartmentId}
            disabled={submitting}
            placeholder="Search departments…"
            aria-label="Department"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={submitting}
            className="h-4 w-4 rounded border-(--border-subtle)"
          />
          Active
        </label>
        <div>
          <label htmlFor="ft-tz" className="block text-sm font-medium text-(--text-primary)">
            Time zone (optional)
          </label>
          <Input
            id="ft-tz"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            maxLength={64}
            disabled={submitting}
            className="mt-1.5"
            placeholder="e.g. America/New_York"
          />
        </div>
        <div>
          <label htmlFor="ft-max" className="block text-sm font-medium text-(--text-primary)">
            Max concurrent assignments (optional)
          </label>
          <Input
            id="ft-max"
            type="number"
            min={1}
            max={10000}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(e.target.value)}
            disabled={submitting}
            className="mt-1.5"
          />
        </div>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
          >
            {error}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || diffEmpty}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                Saving…
              </span>
            ) : mode === "create" ? (
              "Create"
            ) : (
              "Save"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
