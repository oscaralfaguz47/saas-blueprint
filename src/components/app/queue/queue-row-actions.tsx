"use client";

import { useState } from "react";
import { FinanceStatus } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api-client";
import type { ApiFetchOptions } from "@/hooks/use-api-fetch";
import type { FinanceQueueRecord } from "./finance-queue-types";

type ApiFetch = (url: RequestInfo | URL, init?: ApiFetchOptions) => Promise<Response>;

type Props = {
  record: FinanceQueueRecord;
  canReassign: boolean;
  apiFetch: ApiFetch;
  applyPatch: (id: string, patch: Partial<FinanceQueueRecord>) => void;
  rollbackRow: (id: string, snapshot: FinanceQueueRecord) => void;
  removeRow: (id: string) => void;
  restoreRows: (snapshot: FinanceQueueRecord[]) => void;
  getItemsSnapshot: () => FinanceQueueRecord[];
  onRefetch: () => Promise<void>;
  onOpenReassign: (record: FinanceQueueRecord) => void;
};

export function QueueRowActions({
  record,
  canReassign,
  apiFetch,
  applyPatch,
  rollbackRow,
  removeRow,
  restoreRows,
  getItemsSnapshot,
  onRefetch,
  onOpenReassign,
}: Props) {
  const toast = useToast();
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [busy, setBusy] = useState<null | "start" | "complete" | "release">(null);

  const showStart = record.financeStatus === FinanceStatus.ASSIGNED;
  const showComplete =
    record.financeStatus === FinanceStatus.ASSIGNED ||
    record.financeStatus === FinanceStatus.IN_PROGRESS;
  const showRelease = showComplete;

  async function parseError(res: Response): Promise<string> {
    const data = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    return getApiErrorMessage(res, data);
  }

  async function postAction(
    path: string,
    kind: "start" | "complete" | "release",
    optimistic: () => void,
    rollback: () => void
  ) {
    setBusy(kind);
    optimistic();
    try {
      const res = await apiFetch(path, { method: "POST", showToastOnError: false });
      if (!res.ok) {
        rollback();
        const msg = await parseError(res);
        toast.addToast("error", msg);
        return;
      }
      await onRefetch();
    } catch {
      rollback();
      toast.addToast("error", "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function onStart() {
    const before = { ...record };
    void postAction(
      `/api/finance/queue/${record.id}/start`,
      "start",
      () => applyPatch(record.id, { financeStatus: FinanceStatus.IN_PROGRESS }),
      () => rollbackRow(record.id, before)
    );
  }

  function onComplete() {
    const before = { ...record };
    void postAction(
      `/api/finance/queue/${record.id}/complete`,
      "complete",
      () => applyPatch(record.id, { financeStatus: FinanceStatus.COMPLETED }),
      () => rollbackRow(record.id, before)
    );
  }

  function confirmRelease() {
    setReleaseOpen(false);
    const itemsBefore = getItemsSnapshot();
    void postAction(
      `/api/finance/queue/${record.id}/release`,
      "release",
      () => removeRow(record.id),
      () => restoreRows(itemsBefore)
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {showStart ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={onStart}
            className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs font-medium text-(--text-primary) hover:bg-(--bg-surface-hover) disabled:opacity-50"
          >
            {busy === "start" ? "…" : "Start"}
          </button>
        ) : null}
        {showComplete ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={onComplete}
            className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs font-medium text-(--text-primary) hover:bg-(--bg-surface-hover) disabled:opacity-50"
          >
            {busy === "complete" ? "…" : "Complete"}
          </button>
        ) : null}
        {showRelease ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setReleaseOpen(true)}
            className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-surface-hover) disabled:opacity-50"
          >
            Release
          </button>
        ) : null}
        {canReassign ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onOpenReassign(record)}
            className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs font-medium text-(--text-primary) hover:bg-(--bg-surface-hover) disabled:opacity-50"
          >
            Reassign
          </button>
        ) : null}
      </div>

      <Dialog
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="Release this assignment?"
        description="The record returns to the assignment pool. The system may assign it to someone else immediately."
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReleaseOpen(false)}
              className="rounded-lg border border-(--border-subtle) px-3 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-hover)"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRelease}
              className="rounded-lg bg-(--color-primary) px-3 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              Release
            </button>
          </div>
        }
      >
        <p className="text-sm text-(--text-secondary)">
          You can pick it up again only if it is assigned back to you.
        </p>
      </Dialog>
    </>
  );
}
