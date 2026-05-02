"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssignmentRuleStatus, AssignmentStrategy } from "@prisma/client";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { STRATEGY_LABELS, STATUS_LABELS } from "@/lib/assignment-rule-labels";
import { fetchFinanceTeamsDirectory } from "@/lib/workspace-directory-fetch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssignmentRuleCreateModal } from "./assignment-rule-create-modal";
import {
  AssignmentRuleEditModal,
  type AssignmentRuleDetail,
} from "./assignment-rule-edit-modal";

type RuleListRow = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  teamId: string;
  strategy: AssignmentStrategy;
  specificMembershipId: string | null;
  status: AssignmentRuleStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  conditionCount: number;
};

type Props = {
  canManage: boolean;
};

function isUpgradeRequiredPayload(data: unknown): boolean {
  const err = (data as { error?: { details?: unknown } } | null)?.error;
  const d = err?.details;
  return typeof d === "object" && d !== null && (d as { code?: string }).code === "UPGRADE_REQUIRED";
}

export function AssignmentRulesSection({ canManage }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [items, setItems] = useState<RuleListRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [teamOptions, setTeamOptions] = useState<{ value: string; label: string }[]>([]);
  const [teamsById, setTeamsById] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteSubmittingId, setDeleteSubmittingId] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);

  const loadTeamDirectory = useCallback(async () => {
    const agg = await fetchFinanceTeamsDirectory(apiFetch);
    const map: Record<string, string> = {};
    for (const t of agg) map[t.id] = t.name;
    setTeamsById(map);
    setTeamOptions(agg.map((t) => ({ value: t.id, label: t.name })));
  }, [apiFetch]);

  const buildListUrl = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      if (statusFilter) params.set("status", statusFilter);
      if (teamFilter) params.set("teamId", teamFilter);
      if (includeArchived) params.set("includeArchived", "true");
      return `/api/tenant/finance-assignment-rules?${params.toString()}`;
    },
    [statusFilter, teamFilter, includeArchived],
  );

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      const res = await apiFetch(buildListUrl(cursor), { showToastOnError: false });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { items?: RuleListRow[]; nextCursor?: string | null };
      };
      if (!res.ok) return null;
      const rows = data.data?.items ?? [];
      const next = data.data?.nextCursor ?? null;
      if (append) {
        setItems((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...rows.filter((r) => !seen.has(r.id))];
        });
      } else {
        setItems(rows);
      }
      setNextCursor(next);
      return next;
    },
    [apiFetch, buildListUrl],
  );

  useEffect(() => {
    void loadTeamDirectory();
  }, [loadTeamDirectory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await fetchPage(null, false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor, true);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchPage]);

  const statusSelectOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      ...(Object.keys(STATUS_LABELS) as AssignmentRuleStatus[]).map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
      })),
    ],
    [],
  );

  const teamFilterOptions = useMemo(
    () => [{ value: "", label: "All teams" }, ...teamOptions],
    [teamOptions],
  );

  const executeDelete = async (id: string) => {
    setDeleteSubmittingId(id);
    try {
      const res = await apiFetch(`/api/tenant/finance-assignment-rules/${id}`, {
        method: "DELETE",
        showToastOnError: false,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isUpgradeRequiredPayload(data)) {
          setPlanBlocked(true);
          toast.addToast(
            "error",
            (data as { error?: { message?: string } }).error?.message ?? "Plan upgrade required.",
          );
          return;
        }
        toast.addToast(
          "error",
          (data as { error?: { message?: string } }).error?.message ?? "Could not archive rule.",
        );
        return;
      }
      toast.addToast("success", "Assignment rule archived.");
      setItems((prev) =>
        includeArchived
          ? prev.map((r) => (r.id === id ? { ...r, deletedAt: new Date().toISOString() } : r))
          : prev.filter((r) => r.id !== id),
      );
    } finally {
      setDeleteSubmittingId(null);
      setConfirmingDeleteId(null);
    }
  };

  const handleEditSuccess = (updated: AssignmentRuleDetail) => {
    setItems((prev) =>
      prev.map((r) =>
        r.id === updated.id
          ? {
              ...r,
              name: updated.name,
              description: updated.description,
              priority: updated.priority,
              teamId: updated.teamId,
              strategy: updated.strategy,
              specificMembershipId: updated.specificMembershipId,
              status: updated.status,
            }
          : r,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-(--text-primary)">Assignment rules</h3>
        <p className="mt-1 text-sm text-(--text-muted)">
          Route fully approved records to finance processors by priority. Lower priority numbers
          run first.
        </p>
      </div>

      {planBlocked ? (
        <div
          role="status"
          className="rounded-lg border border-(--border-subtle) bg-(--color-info-soft) px-4 py-3 text-sm text-(--text-secondary)"
        >
          <p className="font-medium text-(--text-primary)">Enterprise plan required</p>
          <p className="mt-1">
            Finance assignment rules need an Enterprise plan.{" "}
            <Link href="/app/settings/workspace?tab=billing" className="text-(--color-primary) hover:underline">
              Open billing
            </Link>
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <span className="block text-sm font-medium text-(--text-primary)">Status</span>
          <SearchableSelect
            id="ar-filter-status"
            options={statusSelectOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            disabled={loading}
            placeholder="All statuses"
            aria-label="Filter by status"
          />
        </div>
        <div className="min-w-[200px]">
          <span className="block text-sm font-medium text-(--text-primary)">Team</span>
          <SearchableSelect
            id="ar-filter-team"
            options={teamFilterOptions}
            value={teamFilter}
            onChange={setTeamFilter}
            disabled={loading}
            placeholder="All teams"
            aria-label="Filter by team"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-(--border-subtle)"
          />
          Show archived
        </label>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Create rule
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 text-center text-sm text-(--text-secondary)">
          No assignment rules yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => {
                const archived = r.deletedAt != null;
                const teamName = teamsById[r.teamId] ?? "—";
                return (
                  <TableRow key={r.id} className={archived ? "opacity-70" : ""}>
                    <TableCell className="font-medium text-(--text-primary)">{r.name}</TableCell>
                    <TableCell className="text-sm text-(--text-secondary)">{teamName}</TableCell>
                    <TableCell className="text-sm text-(--text-secondary)">
                      {STRATEGY_LABELS[r.strategy] ?? r.strategy}
                    </TableCell>
                    <TableCell className="text-sm text-(--text-secondary)">{r.priority}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "ACTIVE" ? "success" : r.status === "PAUSED" ? "secondary" : "secondary"
                        }
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-(--text-secondary)">{r.conditionCount}</TableCell>
                    <TableCell className="text-right">
                      {archived || !canManage ? null : (
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditRuleId(r.id)}
                            className="cursor-pointer rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev)"
                          >
                            Edit
                          </button>
                          {confirmingDeleteId === r.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(null)}
                                disabled={deleteSubmittingId === r.id}
                                className="cursor-pointer rounded px-2 py-1 text-xs text-(--text-secondary)"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void executeDelete(r.id)}
                                disabled={deleteSubmittingId === r.id}
                                className="cursor-pointer rounded px-2 py-1 text-xs text-(--color-danger)"
                              >
                                {deleteSubmittingId === r.id ? "…" : "Confirm archive"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(r.id)}
                              className="cursor-pointer rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev)"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {nextCursor ? (
            <div className="border-t border-(--border-subtle) p-3 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="text-sm font-medium text-(--color-primary) hover:underline disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {createOpen ? (
        <AssignmentRuleCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => void fetchPage(null, false)}
          onPlanBlocked={() => setPlanBlocked(true)}
        />
      ) : null}

      {editRuleId ? (
        <AssignmentRuleEditModal
          open={!!editRuleId}
          ruleId={editRuleId}
          onClose={() => setEditRuleId(null)}
          onSuccess={handleEditSuccess}
          onPlanBlocked={() => setPlanBlocked(true)}
        />
      ) : null}
    </div>
  );
}
