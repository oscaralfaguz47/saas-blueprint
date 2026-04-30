"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { RECORD_STATUS_BADGE, RECORD_STATUS_LABELS, RECORD_TYPE_LABELS } from "@/lib/record-utils";
import type { RecordListItem } from "@/types/records";

type LinkType = "FULFILLS" | "RELATED";

type Props = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  onSuccess: () => void;
};

export function LinkRecordModal({ open, onClose, recordId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<RecordListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<LinkType>("RELATED");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search requests as user types
  useEffect(() => {
    if (!open) return;
    const trimmed = search.trim();

    const controller = new AbortController();
    setSearching(true);

    const params = new URLSearchParams({ tab: "all", limit: "10" });
    if (trimmed) params.set("search", trimmed);

    apiFetch(`/api/records?${params}`, {
      showToastOnError: false,
      signal: controller.signal,
    })
      .then((r) => (controller.signal.aborted ? null : r.json()))
      .then(
        (
          json: { data?: { records?: RecordListItem[] } } | null
        ) => {
          if (!json || controller.signal.aborted) return;
          // Exclude current record from results
          const filtered = (json.data?.records ?? []).filter(
            (r) => r.id !== recordId
          );
          setResults(filtered);
        }
      )
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });

    return () => controller.abort();
  }, [open, search, apiFetch, recordId]);

  function handleClose() {
    setSearch("");
    setResults([]);
    setSelectedId(null);
    setLinkType("RELATED");
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError("Please select a request to link.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toRecordId: selectedId, linkType }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { alreadyLinked?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to create link.");
        return;
      }
      toast.addToast(
        "success",
        json.data?.alreadyLinked ? "Already linked." : "Request linked."
      );
      handleClose();
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedRecord = results.find((r) => r.id === selectedId);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Link to existing request"
      contentClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}

        {/* Search */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Search requests
          </label>
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
            placeholder="Search by title…"
            autoFocus
          />
        </div>

        {/* Results list */}
        <div className="max-h-48 overflow-y-auto rounded-lg border border-(--border-subtle)">
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-(--text-muted)">
              <Spinner size="sm" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-(--text-muted)">
              {search ? "No requests found." : "Start typing to search…"}
            </p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={[
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      selectedId === r.id
                        ? "bg-(--color-primary-soft)"
                        : "hover:bg-(--bg-surface-elev)",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        selectedId === r.id
                          ? "border-(--color-primary) bg-(--color-primary)"
                          : "border-(--border-strong)",
                      ].join(" ")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-(--text-primary)">{r.title}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant={RECORD_STATUS_BADGE[r.status]}>
                          {RECORD_STATUS_LABELS[r.status]}
                        </Badge>
                        <span className="text-xs text-(--text-muted)">
                          {RECORD_TYPE_LABELS[r.type]}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Link type */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Relationship
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "RELATED" as LinkType, label: "Related", desc: "These requests are related to each other." },
              { value: "FULFILLS" as LinkType, label: "Fulfills", desc: "This request fulfills the selected one." },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLinkType(opt.value)}
                className={[
                  "rounded-lg border p-3 text-left transition-colors",
                  linkType === opt.value
                    ? "border-(--color-primary) bg-(--color-primary-soft)"
                    : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--bg-surface-hover)",
                ].join(" ")}
              >
                <p className="text-sm font-medium text-(--text-primary)">{opt.label}</p>
                <p className="mt-0.5 text-xs text-(--text-muted)">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {selectedRecord && (
          <div className="rounded-lg border border-(--color-primary-soft) bg-(--color-primary-soft) px-3 py-2">
            <p className="text-xs font-medium text-(--color-primary)">Selected:</p>
            <p className="truncate text-sm text-(--text-primary)">{selectedRecord.title}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
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
            disabled={submitting || !selectedId}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Linking…" : "Link request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
