"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  FinanceTeamFormModal,
  type FinanceTeamListItem,
} from "./finance-team-form-modal";
import { FinanceTeamMemberAddModal } from "./finance-team-member-add-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DepartmentOption = { id: string; name: string };

type TeamMemberRow = {
  id: string;
  membershipId: string;
  weight: number;
  isLead: boolean;
  joinedAt: string;
  deletedAt: string | null;
  membership: {
    userId: string;
    user: { id: string; email: string | null; name: string | null; image: string | null };
  };
};

type Props = {
  canManage: boolean;
};

const SEARCH_DEBOUNCE_MS = 300;

export function FinanceTeamsSection({ canManage }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [teams, setTeams] = useState<FinanceTeamListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchSent, setSearchSent] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingTeam, setEditingTeam] = useState<FinanceTeamListItem | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [membersByTeam, setMembersByTeam] = useState<Record<string, TeamMemberRow[]>>({});
  const [membersLoadingId, setMembersLoadingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteSubmittingId, setDeleteSubmittingId] = useState<string | null>(null);
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [weightDirty, setWeightDirty] = useState<Record<string, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const membersFetchedRef = useRef<Set<string>>(new Set());

  const deptSelectOptions = useMemo(
    () => [
      { value: "", label: "All departments" },
      ...departments.map((d) => ({ value: d.id, label: d.name })),
    ],
    [departments],
  );

  const loadDepartments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/tenant/departments?activeOnly=true", {
        showToastOnError: false,
      });
      const json = (await res.json()) as {
        data?: { departments?: { id: string; name: string }[] };
      };
      const list = json.data?.departments ?? [];
      setDepartments(list.map((d) => ({ id: d.id, name: d.name })));
    } catch {
      setDepartments([]);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  const buildListUrl = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      if (searchSent.trim()) params.set("search", searchSent.trim());
      if (departmentFilter) params.set("departmentId", departmentFilter);
      if (includeArchived) params.set("includeArchived", "true");
      return `/api/tenant/finance-teams?${params.toString()}`;
    },
    [searchSent, departmentFilter, includeArchived],
  );

  const fetchTeamsPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      const res = await apiFetch(buildListUrl(cursor), { showToastOnError: false });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { items?: FinanceTeamListItem[]; nextCursor?: string | null };
      };
      if (!res.ok) return null;
      const items = data.data?.items ?? [];
      const next = data.data?.nextCursor ?? null;
      if (append) {
        setTeams((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          return [...prev, ...items.filter((t) => !seen.has(t.id))];
        });
      } else {
        setTeams(items);
      }
      setNextCursor(next);
      return next;
    },
    [apiFetch, buildListUrl],
  );

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchSent(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await fetchTeamsPage(null, false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchSent, departmentFilter, includeArchived, fetchTeamsPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchTeamsPage(nextCursor, true);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchTeamsPage]);

  const loadTeamMembers = useCallback(
    async (teamId: string, force = false) => {
      if (force) membersFetchedRef.current.delete(teamId);
      if (!force && membersFetchedRef.current.has(teamId)) return;
      membersFetchedRef.current.add(teamId);
      setMembersLoadingId(teamId);
      try {
        const aggregated: TeamMemberRow[] = [];
        let cursor: string | null | undefined = undefined;
        for (let i = 0; i < 15; i++) {
          const params = new URLSearchParams();
          params.set("limit", "20");
          if (cursor) params.set("cursor", cursor);
          const res = await apiFetch(
            `/api/tenant/finance-teams/${teamId}/members?${params.toString()}`,
            { showToastOnError: false },
          );
          const data = (await res.json().catch(() => ({}))) as {
            data?: { items?: TeamMemberRow[]; nextCursor?: string | null };
          };
          if (!res.ok) break;
          const items = data.data?.items ?? [];
          aggregated.push(...items);
          cursor = data.data?.nextCursor ?? null;
          if (!cursor) break;
        }
        setMembersByTeam((prev) => ({ ...prev, [teamId]: aggregated }));
      } finally {
        setMembersLoadingId(null);
      }
    },
    [apiFetch],
  );

  const toggleExpand = (teamId: string) => {
    setExpandedTeamId((id) => {
      const next = id === teamId ? null : teamId;
      if (next) void loadTeamMembers(next);
      return next;
    });
  };

  const invalidateMembers = (teamId: string) => {
    membersFetchedRef.current.delete(teamId);
    setMembersByTeam((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
  };

  const handleTeamSaved = (t: FinanceTeamListItem) => {
    setTeams((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = t;
        return copy;
      }
      return [t, ...prev];
    });
    invalidateMembers(t.id);
  };

  const handleCreateSuccess = (t: FinanceTeamListItem) => {
    setTeams((prev) => [t, ...prev]);
  };

  const executeDelete = async (teamId: string) => {
    setDeleteSubmittingId(teamId);
    try {
      const res = await apiFetch(`/api/tenant/finance-teams/${teamId}`, {
        method: "DELETE",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        toast.addToast("error", data.error?.message ?? "Could not delete team.");
        return;
      }
      toast.addToast("success", "Finance team archived.");
      setTeams((prev) =>
        includeArchived
          ? prev.map((t) => (t.id === teamId ? { ...t, deletedAt: new Date().toISOString() } : t))
          : prev.filter((t) => t.id !== teamId),
      );
      setExpandedTeamId((id) => (id === teamId ? null : id));
      setMembersByTeam((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
    } finally {
      setDeleteSubmittingId(null);
      setConfirmingDeleteId(null);
    }
  };

  const patchMember = async (
    teamId: string,
    memberRowId: string,
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    const res = await apiFetch(`/api/tenant/finance-teams/${teamId}/members/${memberRowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      showToastOnError: false,
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: TeamMemberRow;
      error?: { message?: string };
    };
    if (!res.ok) {
      toast.addToast("error", data.error?.message ?? "Could not update member.");
      return false;
    }
    if (data.data) {
      setMembersByTeam((prev) => {
        const list = prev[teamId] ?? [];
        return {
          ...prev,
          [teamId]: list.map((m) => (m.id === memberRowId ? data.data! : m)),
        };
      });
    }
    return true;
  };

  const onWeightBlur = async (teamId: string, m: TeamMemberRow) => {
    const raw = (weightDirty[m.id] ?? String(m.weight)).trim();
    const n = raw === "" ? m.weight : Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 1000) {
      setWeightDirty((d) => ({ ...d, [m.id]: String(m.weight) }));
      toast.addToast("error", "Weight must be between 1 and 1000.");
      return;
    }
    const w = Math.floor(n);
    if (w === m.weight) {
      setWeightDirty((d) => {
        const next = { ...d };
        delete next[m.id];
        return next;
      });
      return;
    }
    const ok = await patchMember(teamId, m.id, { weight: w });
    if (ok) {
      setWeightDirty((d) => {
        const next = { ...d };
        delete next[m.id];
        return next;
      });
    } else {
      setWeightDirty((d) => ({ ...d, [m.id]: String(m.weight) }));
    }
  };

  const onLeadChange = async (teamId: string, m: TeamMemberRow, isLead: boolean) => {
    if (pendingMemberId === m.id) return;
    if (isLead === m.isLead) return;
    setPendingMemberId(m.id);
    try {
      await patchMember(teamId, m.id, { isLead });
    } finally {
      setPendingMemberId(null);
    }
  };

  const removeMember = async (teamId: string, m: TeamMemberRow) => {
    const res = await apiFetch(`/api/tenant/finance-teams/${teamId}/members/${m.id}`, {
      method: "DELETE",
      showToastOnError: false,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      toast.addToast("error", data.error?.message ?? "Could not remove member.");
      return;
    }
    toast.addToast("success", "Member removed from team.");
    setMembersByTeam((prev) => ({
      ...prev,
      [teamId]: (prev[teamId] ?? []).filter((x) => x.id !== m.id),
    }));
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, memberCount: Math.max(0, t.memberCount - 1) } : t,
      ),
    );
  };

  const [confirmRemove, setConfirmRemove] = useState<{ teamId: string; memberId: string } | null>(
    null,
  );

  const addModalExistingIds = useMemo(() => {
    if (!addMemberTeamId) return new Set<string>();
    const rows = membersByTeam[addMemberTeamId] ?? [];
    return new Set(rows.map((r) => r.membershipId));
  }, [addMemberTeamId, membersByTeam]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-(--text-primary)">Finance teams</h3>
        <p className="mt-1 text-sm text-(--text-muted)">
          Create teams and assign members for finance assignment routing.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="block text-sm font-medium text-(--text-primary)">Search</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Team name"
            disabled={loading}
            className="mt-1.5"
            maxLength={200}
          />
        </div>
        <div className="min-w-[200px]">
          <span className="block text-sm font-medium text-(--text-primary)">Department</span>
          <SearchableSelect
            id="ft-filter-dept"
            options={deptSelectOptions}
            value={departmentFilter}
            onChange={setDepartmentFilter}
            disabled={loading}
            placeholder="All departments"
            aria-label="Filter by department"
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
            onClick={() => {
              setFormMode("create");
              setEditingTeam(null);
              setFormOpen(true);
            }}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Create team
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 text-center text-sm text-(--text-secondary)">
          No finance teams yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => {
                const archived = t.deletedAt != null;
                const expanded = expandedTeamId === t.id;
                const members = membersByTeam[t.id];
                const deptName = departments.find((d) => d.id === t.departmentId)?.name ?? "—";
                return (
                  <Fragment key={t.id}>
                    <TableRow className={archived ? "opacity-70" : ""}>
                      <TableCell>
                        {!archived ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(t.id)}
                            className="cursor-pointer text-(--text-muted) hover:text-(--text-primary)"
                            aria-expanded={expanded}
                          >
                            {expanded ? "▼" : "▶"}
                          </button>
                        ) : (
                          <span className="text-(--text-muted)">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-(--text-primary)">{t.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-(--text-secondary)">
                        {t.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-(--text-secondary)">{deptName}</TableCell>
                      <TableCell className="text-sm text-(--text-secondary)">{t.memberCount}</TableCell>
                      <TableCell>
                        {archived ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : t.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {archived || !canManage ? null : (
                          <div className="flex flex-wrap justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFormMode("edit");
                                setEditingTeam(t);
                                setFormOpen(true);
                              }}
                              className="cursor-pointer rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev)"
                            >
                              Edit
                            </button>
                            {confirmingDeleteId === t.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteId(null)}
                                  disabled={deleteSubmittingId === t.id}
                                  className="cursor-pointer rounded px-2 py-1 text-xs text-(--text-secondary) hover:bg-(--bg-surface-elev)"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void executeDelete(t.id)}
                                  disabled={deleteSubmittingId === t.id}
                                  className="cursor-pointer rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev)"
                                >
                                  {deleteSubmittingId === t.id ? "…" : "Confirm archive"}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(t.id)}
                                className="cursor-pointer rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev)"
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded && !archived ? (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-(--bg-surface-elev) p-0">
                          <div className="p-4">
                            {membersLoadingId === t.id ? (
                              <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                                <Spinner size="sm" /> Loading members…
                              </div>
                            ) : (
                              <>
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs font-medium text-(--text-muted)">
                                    Members
                                  </span>
                                  {canManage ? (
                                    <button
                                      type="button"
                                      onClick={() => setAddMemberTeamId(t.id)}
                                      className="cursor-pointer text-sm font-medium text-(--color-primary) hover:underline"
                                    >
                                      Add member
                                    </button>
                                  ) : null}
                                </div>
                                {(members ?? []).length === 0 ? (
                                  <p className="text-sm text-(--text-muted)">No members yet.</p>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Weight</TableHead>
                                        <TableHead>Lead</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {(members ?? []).map((m) => (
                                        <TableRow key={m.id}>
                                          <TableCell className="text-(--text-primary)">
                                            {m.membership.user.name ?? "—"}
                                          </TableCell>
                                          <TableCell className="text-sm text-(--text-secondary)">
                                            {m.membership.user.email ?? "—"}
                                          </TableCell>
                                          <TableCell>
                                            <input
                                              type="number"
                                              min={1}
                                              max={1000}
                                              className="w-20 rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs"
                                              value={weightDirty[m.id] ?? String(m.weight)}
                                              onChange={(e) =>
                                                setWeightDirty((d) => ({
                                                  ...d,
                                                  [m.id]: e.target.value,
                                                }))
                                              }
                                              onBlur={() => void onWeightBlur(t.id, m)}
                                              disabled={pendingMemberId === m.id}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <input
                                              type="checkbox"
                                              checked={m.isLead}
                                              onChange={(e) =>
                                                void onLeadChange(t.id, m, e.target.checked)
                                              }
                                              disabled={pendingMemberId === m.id}
                                              className="h-4 w-4 rounded border-(--border-subtle)"
                                            />
                                          </TableCell>
                                          <TableCell className="text-xs text-(--text-muted)">
                                            {new Date(m.joinedAt).toLocaleDateString()}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {confirmRemove?.teamId === t.id &&
                                            confirmRemove.memberId === m.id ? (
                                              <span className="inline-flex gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmRemove(null)}
                                                  className="cursor-pointer text-xs text-(--text-secondary)"
                                                >
                                                  Cancel
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    void removeMember(t.id, m);
                                                    setConfirmRemove(null);
                                                  }}
                                                  className="cursor-pointer text-xs text-(--color-danger)"
                                                >
                                                  Confirm
                                                </button>
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setConfirmRemove({ teamId: t.id, memberId: m.id })
                                                }
                                                className="cursor-pointer text-xs text-(--color-danger) hover:underline"
                                              >
                                                Remove
                                              </button>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
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

      <FinanceTeamFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTeam(null);
        }}
        mode={formMode}
        team={formMode === "edit" ? editingTeam : null}
        departmentOptions={departments}
        onSuccess={formMode === "create" ? handleCreateSuccess : handleTeamSaved}
      />

      {addMemberTeamId ? (
        <FinanceTeamMemberAddModal
          key={`${addMemberTeamId}-${[...addModalExistingIds].sort().join(",")}`}
          open
          onClose={() => setAddMemberTeamId(null)}
          teamId={addMemberTeamId}
          existingMembershipIds={addModalExistingIds}
          onSuccess={() => {
            invalidateMembers(addMemberTeamId);
            void loadTeamMembers(addMemberTeamId, true);
            setTeams((prev) =>
              prev.map((x) =>
                x.id === addMemberTeamId ? { ...x, memberCount: x.memberCount + 1 } : x,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
