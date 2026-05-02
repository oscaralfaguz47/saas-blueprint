"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FinanceTeamsSection } from "./finance-teams-section";

type Department = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { costCenters: number };
};

type CostCenter = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  departmentId: string;
  department: { id: string; name: string; code: string | null } | null;
  createdAt: string;
};

type Props = {
  canManage: boolean;
};

export function FinancialConfigTab({ canManage }: Props) {
  const [activeSection, setActiveSection] = useState<
    "departments" | "cost-centers" | "finance-teams"
  >("departments");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-(--text-primary)">Financial configuration</h2>
        <p className="mt-1 text-sm text-(--text-muted)">
          Manage departments, cost centers, and finance teams used to classify and route financial
          requests.
        </p>
      </div>

      <div className="rounded-lg border border-(--border-subtle) bg-(--color-info-soft) px-4 py-3 text-sm text-(--text-secondary)">
        These starter departments and cost centers were created automatically to help you get
        started. Review and customize them to match your financial structure. Finance teams are
        managed under the Finance teams tab.
      </div>

      <div className="flex flex-wrap gap-0.5 border-b border-(--border-subtle)">
        {(["departments", "cost-centers", "finance-teams"] as const).map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            className={[
              "px-4 py-2.5 text-sm font-medium transition-colors",
              activeSection === section
                ? "border-b-2 border-(--color-primary) text-(--color-primary)"
                : "text-(--text-muted) hover:text-(--text-secondary)",
            ].join(" ")}
          >
            {section === "departments"
              ? "Departments"
              : section === "cost-centers"
                ? "Cost centers"
                : "Finance teams"}
          </button>
        ))}
      </div>

      {activeSection === "departments" && <DepartmentsSection canManage={canManage} />}
      {activeSection === "cost-centers" && <CostCentersSection canManage={canManage} />}
      {activeSection === "finance-teams" && <FinanceTeamsSection canManage={canManage} />}
    </div>
  );
}

function DepartmentsSection({ canManage }: { canManage: boolean }) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tenant/departments?activeOnly=${!showInactive}`, {
        showToastOnError: false,
      });
      const json = (await res.json()) as {
        data?: { departments?: Department[] };
      };
      setDepartments(json.data?.departments ?? []);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = departments.filter(
    (d) =>
      !search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.code?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  async function handleArchive(dept: Department) {
    setActionLoading(dept.id);
    try {
      const res = await apiFetch(`/api/tenant/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: dept.isActive ? "archive" : "reactivate" }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", json.error?.message ?? "Action failed.");
        return;
      }
      toast.addToast(
        "success",
        dept.isActive ? "Department archived." : "Department reactivated."
      );
      await load();
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search departments..."
            className="w-56"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            + Add department
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) py-12 text-center">
          <p className="text-sm font-medium text-(--text-primary)">
            {search ? "No departments match your search." : "No departments yet."}
          </p>
          <p className="mt-1 text-xs text-(--text-muted)">
            {!search && "Departments help organize financial requests by team or function."}
          </p>
          {canManage && !search && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-(--border-subtle) px-3 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              + Add first department
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-(--border-subtle)">
          <table className="w-full text-sm">
            <thead className="border-b border-(--border-subtle) bg-(--bg-surface-elev)">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Code
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Cost centers
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Status
                </th>
                {canManage && (
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-(--text-muted)">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
              {filtered.map((dept) => (
                <tr
                  key={dept.id}
                  className="bg-(--bg-surface) transition-colors hover:bg-(--bg-surface-elev)"
                >
                  <td className="px-4 py-3 font-medium text-(--text-primary)">{dept.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-(--text-muted)">
                    {dept.code ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-(--text-secondary)">
                    {dept._count?.costCenters ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={dept.isActive ? "success" : "secondary"}>
                      {dept.isActive ? "Active" : "Archived"}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditTarget(dept)}
                          className="text-xs text-(--color-primary) hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleArchive(dept)}
                          disabled={actionLoading === dept.id}
                          className="text-xs text-(--text-muted) hover:text-(--text-secondary) disabled:opacity-50"
                        >
                          {actionLoading === dept.id
                            ? "..."
                            : dept.isActive
                              ? "Archive"
                              : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <DepartmentFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
      {editTarget && (
        <DepartmentFormModal
          mode="edit"
          department={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function DepartmentFormModal({
  mode,
  department,
  onClose,
  onSuccess,
}: {
  mode: "create" | "edit";
  department?: Department;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const apiFetch = useApiFetch();
  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const url =
        mode === "create" ? "/api/tenant/departments" : `/api/tenant/departments/${department!.id}`;
      const res = await apiFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || undefined,
          description: description.trim() || undefined,
        }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to save.");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={mode === "create" ? "Add department" : "Edit department"}
      description={
        mode === "create"
          ? "Add a department to organize your financial requests."
          : "Update department details."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Name <span className="text-(--color-danger)">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Finance"
            maxLength={120}
            disabled={submitting}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Code <span className="text-xs font-normal text-(--text-muted)">(optional)</span>
          </label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. FIN"
            maxLength={40}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Description <span className="text-xs font-normal text-(--text-muted)">(optional)</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            maxLength={500}
            rows={2}
            disabled={submitting}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Saving..." : mode === "create" ? "Add department" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function CostCentersSection({ canManage }: { canManage: boolean }) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDeptId, setFilterDeptId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CostCenter | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ccRes, deptRes] = await Promise.all([
        apiFetch(`/api/tenant/cost-centers?activeOnly=${!showInactive}`, { showToastOnError: false }),
        apiFetch("/api/tenant/departments?activeOnly=false", { showToastOnError: false }),
      ]);
      const ccJson = (await ccRes.json()) as { data?: { costCenters?: CostCenter[] } };
      const deptJson = (await deptRes.json()) as { data?: { departments?: Department[] } };
      setCostCenters(ccJson.data?.costCenters ?? []);
      setDepartments(deptJson.data?.departments ?? []);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = costCenters.filter((cc) => {
    const matchesSearch =
      !search.trim() ||
      cc.code.toLowerCase().includes(search.toLowerCase()) ||
      cc.name.toLowerCase().includes(search.toLowerCase());
    const matchesDept = !filterDeptId || cc.departmentId === filterDeptId;
    return matchesSearch && matchesDept;
  });

  async function handleArchive(cc: CostCenter) {
    setActionLoading(cc.id);
    try {
      const res = await apiFetch(`/api/tenant/cost-centers/${cc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cc.isActive ? "archive" : "reactivate" }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", json.error?.message ?? "Action failed.");
        return;
      }
      toast.addToast(
        "success",
        cc.isActive ? "Cost center archived." : "Cost center reactivated."
      );
      await load();
    } catch {
      toast.addToast("error", "Network error.");
    } finally {
      setActionLoading(null);
    }
  }

  const deptOptions = [
    { value: "", label: "All departments" },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];

  const departmentsForCreate = departments.filter((d) => d.isActive);
  const departmentsForEdit = (cc: CostCenter | null) =>
    departments.filter((d) => d.isActive || (cc && d.id === cc.departmentId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or name..."
            className="w-56"
          />
          <div className="w-48">
            <SearchableSelect
              options={deptOptions}
              value={filterDeptId}
              onChange={setFilterDeptId}
              placeholder="Filter by department"
              aria-label="Filter by department"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            + Add cost center
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) py-12 text-center">
          <p className="text-sm font-medium text-(--text-primary)">
            {search || filterDeptId
              ? "No cost centers match your filters."
              : "No cost centers yet."}
          </p>
          <p className="mt-1 text-xs text-(--text-muted)">
            {!search &&
              !filterDeptId &&
              "Cost centers classify financial spend and support approval routing."}
          </p>
          {canManage && !search && !filterDeptId && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-(--border-subtle) px-3 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              + Add first cost center
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-(--border-subtle)">
          <table className="w-full text-sm">
            <thead className="border-b border-(--border-subtle) bg-(--bg-surface-elev)">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Code
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Department
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-(--text-muted)">
                  Status
                </th>
                {canManage && (
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-(--text-muted)">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
              {filtered.map((cc) => (
                <tr
                  key={cc.id}
                  className="bg-(--bg-surface) transition-colors hover:bg-(--bg-surface-elev)"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-(--text-primary)">
                    {cc.code}
                  </td>
                  <td className="px-4 py-3 text-(--text-primary)">{cc.name}</td>
                  <td className="px-4 py-3 text-(--text-secondary)">
                    {cc.department?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cc.isActive ? "success" : "secondary"}>
                      {cc.isActive ? "Active" : "Archived"}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditTarget(cc)}
                          className="text-xs text-(--color-primary) hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleArchive(cc)}
                          disabled={actionLoading === cc.id}
                          className="text-xs text-(--text-muted) hover:text-(--text-secondary) disabled:opacity-50"
                        >
                          {actionLoading === cc.id
                            ? "..."
                            : cc.isActive
                              ? "Archive"
                              : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CostCenterFormModal
          mode="create"
          departments={departmentsForCreate}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
      {editTarget && (
        <CostCenterFormModal
          mode="edit"
          costCenter={editTarget}
          departments={departmentsForEdit(editTarget)}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CostCenterFormModal({
  mode,
  costCenter,
  departments,
  onClose,
  onSuccess,
}: {
  mode: "create" | "edit";
  costCenter?: CostCenter;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const apiFetch = useApiFetch();
  const [code, setCode] = useState(costCenter?.code ?? "");
  const [name, setName] = useState(costCenter?.name ?? "");
  const [departmentId, setDepartmentId] = useState(costCenter?.departmentId ?? "");
  const [description, setDescription] = useState(costCenter?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deptOptions = departments.map((d) => ({
    value: d.id,
    label: d.code ? `${d.code} — ${d.name}` : d.name,
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!departmentId) {
      setError("Department is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const url =
        mode === "create"
          ? "/api/tenant/cost-centers"
          : `/api/tenant/cost-centers/${costCenter!.id}`;
      const res = await apiFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          departmentId,
          description: description.trim() || undefined,
        }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to save.");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={mode === "create" ? "Add cost center" : "Edit cost center"}
      description={
        mode === "create"
          ? "Add a cost center linked to a department."
          : "Update cost center details."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-(--text-primary)">
              Code <span className="text-(--color-danger)">*</span>
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. FIN-100"
              maxLength={40}
              disabled={submitting}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-(--text-primary)">
              Name <span className="text-(--color-danger)">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Finance General"
              maxLength={120}
              disabled={submitting}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Department <span className="text-(--color-danger)">*</span>
          </label>
          {deptOptions.length === 0 ? (
            <p className="text-sm text-(--color-warning)">
              No active departments available. Create a department first.
            </p>
          ) : (
            <SearchableSelect
              options={deptOptions}
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Select department..."
              aria-label="Department"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Description <span className="text-xs font-normal text-(--text-muted)">(optional)</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            maxLength={500}
            rows={2}
            disabled={submitting}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !code.trim() || !name.trim() || !departmentId}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Saving..." : mode === "create" ? "Add cost center" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
