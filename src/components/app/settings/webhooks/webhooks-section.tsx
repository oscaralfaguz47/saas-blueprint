"use client";

import { useCallback, useEffect, useState } from "react";
import { WebhookEndpointStatus } from "@prisma/client";
import { PlanGateBanner } from "@/components/ui/plan-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/notifications-format";
import { CreateEndpointModal } from "./create-endpoint-modal";
import { EditEndpointModal } from "./edit-endpoint-modal";
import { DeleteEndpointModal } from "./delete-endpoint-modal";
import { RotateSecretModal } from "./rotate-secret-modal";
import { SecretDisplayDialog } from "./secret-display-dialog";

type WebhookListItem = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  subscribedEvents: string[];
  secretHint: string;
  status: WebhookEndpointStatus;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  disabledAutoAt: string | null;
  disabledAutoReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type Props = {
  planWebhooksEnabled: boolean;
};

function statusBadge(status: WebhookEndpointStatus) {
  switch (status) {
    case WebhookEndpointStatus.ACTIVE:
      return <Badge variant="success">Active</Badge>;
    case WebhookEndpointStatus.PAUSED:
      return <Badge variant="warning">Paused</Badge>;
    case WebhookEndpointStatus.DISABLED_AUTO:
      return <Badge variant="destructive">Auto-disabled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function formatLast(iso: string | null): string {
  if (iso == null) return "Never";
  const t = formatRelativeTime(iso);
  return t || "Never";
}

export function WebhooksSection({ planWebhooksEnabled }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [planBlocked, setPlanBlocked] = useState(!planWebhooksEnabled);
  const [items, setItems] = useState<WebhookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WebhookListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookListItem | null>(null);
  const [rotateTarget, setRotateTarget] = useState<WebhookListItem | null>(null);
  const [secretToShow, setSecretToShow] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoadError(null);
    const res = await apiFetch("/api/tenant/webhook-endpoints?limit=50", {
      showToastOnError: false,
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { items?: WebhookListItem[] };
      error?: { code?: string; message?: string };
    };

    if (!res.ok) {
      if (isUpgradeRequiredFromApiResponse(data)) {
        setPlanBlocked(true);
        setLoadError(data.error?.message ?? "Plan upgrade required.");
        return;
      }
      setLoadError(getApiErrorMessage(res, data));
      return;
    }

    setItems(data.data?.items ?? []);
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await fetchList();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const handlePlanBlocked = useCallback(() => {
    setPlanBlocked(true);
  }, []);

  const handleActivate = async (id: string) => {
    const res = await apiFetch(`/api/tenant/webhook-endpoints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
      showToastOnError: false,
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: WebhookListItem;
      error?: { message?: string };
    };
    if (!res.ok) {
      if (isUpgradeRequiredFromApiResponse(data)) {
        setPlanBlocked(true);
        toast.addToast("error", data.error?.message ?? "Plan upgrade required.");
        return;
      }
      toast.addToast("error", getApiErrorMessage(res, data));
      return;
    }
    if (data.data) {
      setItems((prev) => prev.map((e) => (e.id === id ? data.data! : e)));
    }
    toast.addToast("success", "Webhook endpoint is active again.");
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-(--text-primary)">Webhooks</h3>
        <p className="mt-1 text-sm text-(--text-muted)">
          Send workspace events to your HTTPS endpoint. Secrets are shown only once when created or rotated.
        </p>
      </div>

      <PlanGateBanner
        variant="section"
        visible={planBlocked}
        title="Plan upgrade required"
        description="Outbound webhooks require an eligible plan."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={planBlocked}
        >
          Create endpoint
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-(--border-subtle) p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-full max-w-md" />
              <Skeleton className="mt-3 h-9 w-28" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--text-primary)">
          <p>{loadError}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void fetchList()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No webhook endpoints yet"
          description="Create one to receive event notifications at your server."
          action={
            planBlocked
              ? undefined
              : { label: "Create endpoint", onClick: () => setCreateOpen(true) }
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((ep) => (
            <li
              key={ep.id}
              className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-(--text-primary)">{ep.name}</h4>
                    {statusBadge(ep.status)}
                  </div>
                  <p
                    className="mt-1 truncate text-sm text-(--text-muted)"
                    title={ep.url}
                  >
                    {ep.url}
                  </p>
                  {ep.status === WebhookEndpointStatus.DISABLED_AUTO && ep.disabledAutoReason ? (
                    <p className="mt-2 text-sm text-(--color-danger)">{ep.disabledAutoReason}</p>
                  ) : null}
                </div>
              </div>

              <p className="mt-2 text-xs text-(--text-muted)">
                {ep.subscribedEvents.length} event{ep.subscribedEvents.length === 1 ? "" : "s"} subscribed · Last
                success {formatLast(ep.lastSuccessAt)} · Last failure {formatLast(ep.lastFailureAt)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {ep.status === WebhookEndpointStatus.PAUSED ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={planBlocked}
                    onClick={() => void handleActivate(ep.id)}
                  >
                    Resume
                  </Button>
                ) : null}
                {ep.status === WebhookEndpointStatus.DISABLED_AUTO ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={planBlocked}
                    onClick={() => void handleActivate(ep.id)}
                  >
                    Reactivate
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditTarget(ep)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={planBlocked}
                  onClick={() => setRotateTarget(ep)}
                >
                  Rotate secret
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(ep)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateEndpointModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPlanBlocked={handlePlanBlocked}
        onCreated={() => void fetchList()}
        onSuccessWithSecret={(secret) => setSecretToShow(secret)}
      />

      <EditEndpointModal
        open={editTarget !== null}
        endpoint={editTarget}
        onClose={() => setEditTarget(null)}
        onPlanBlocked={handlePlanBlocked}
        onSaved={(row) => {
          setItems((prev) =>
            prev.map((e) => (e.id === row.id ? { ...e, ...(row as unknown as WebhookListItem) } : e)),
          );
        }}
      />

      <DeleteEndpointModal
        open={deleteTarget !== null}
        endpoint={
          deleteTarget ? { id: deleteTarget.id, name: deleteTarget.name, url: deleteTarget.url } : null
        }
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => void fetchList()}
      />

      <RotateSecretModal
        open={rotateTarget !== null}
        endpoint={rotateTarget ? { id: rotateTarget.id, name: rotateTarget.name } : null}
        onClose={() => setRotateTarget(null)}
        onPlanBlocked={handlePlanBlocked}
        onSuccessWithSecret={(secret) => setSecretToShow(secret)}
      />

      <SecretDisplayDialog
        open={secretToShow !== null}
        secret={secretToShow ?? ""}
        onAcknowledge={() => {
          setSecretToShow(null);
          void fetchList();
        }}
      />
    </div>
  );
}
