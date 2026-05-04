"use client";

import { useEffect, useState } from "react";
import { WebhookEndpointStatus } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { getApiErrorMessage } from "@/lib/api-client";
import { WEBHOOK_EVENT_NAMES } from "@/lib/webhooks/event-catalog";
import { WEBHOOK_EVENT_LABELS } from "./event-labels";

type EndpointForEdit = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  subscribedEvents: string[];
  status: WebhookEndpointStatus;
};

type Props = {
  open: boolean;
  endpoint: EndpointForEdit | null;
  onClose: () => void;
  onPlanBlocked: () => void;
  onSaved: (row: EndpointForEdit) => void;
};

export function EditEndpointModal({ open, endpoint, onClose, onPlanBlocked, onSaved }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const [events, setEvents] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !endpoint) return;
    setName(endpoint.name);
    setDescription(endpoint.description ?? "");
    setStatus(
      endpoint.status === WebhookEndpointStatus.PAUSED ? "PAUSED" : "ACTIVE",
    );
    setEvents(new Set(endpoint.subscribedEvents));
    setFormError(null);
  }, [open, endpoint]);

  if (!endpoint) return null;

  const isAutoDisabled = endpoint.status === WebhookEndpointStatus.DISABLED_AUTO;

  const toggleEvent = (e: string) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (events.size < 1) {
      setFormError("Select at least one event.");
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      subscribedEvents: [...events],
    };
    if (!isAutoDisabled) {
      const nextStatus =
        status === "PAUSED" ? WebhookEndpointStatus.PAUSED : WebhookEndpointStatus.ACTIVE;
      if (nextStatus !== endpoint.status) {
        body.status = nextStatus;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/webhook-endpoints/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: EndpointForEdit;
        error?: { code?: string; message?: string };
      };

      if (!res.ok) {
        if (isUpgradeRequiredFromApiResponse(data)) {
          onPlanBlocked();
          toast.addToast("error", data.error?.message ?? "Plan upgrade required.");
          return;
        }
        setFormError(getApiErrorMessage(res, data));
        return;
      }

      const row = data.data;
      if (!row) {
        toast.addToast("error", "Could not read updated endpoint.");
        return;
      }

      toast.addToast("success", "Webhook endpoint updated.");
      onSaved(row);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit webhook endpoint"
      description="URL cannot be changed. Create a new endpoint for a different URL."
      closeDisabled={submitting}
    >
      <div className="space-y-4">
        {formError ? (
          <p className="text-sm text-(--color-danger)" role="alert">
            {formError}
          </p>
        ) : null}

        {isAutoDisabled ? (
          <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--text-primary)">
            <Badge variant="destructive">Auto-disabled</Badge>
            <p className="mt-2 text-(--text-secondary)">
              Delivery was paused automatically. Use <strong>Reactivate</strong> on the card to resume — status
              cannot be changed here.
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="wh-edit-name" className="mb-1 block text-sm font-medium text-(--text-primary)">
            Name <span className="text-(--color-danger)">*</span>
          </label>
          <Input
            id="wh-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="wh-edit-desc" className="mb-1 block text-sm font-medium text-(--text-primary)">
            Description
          </label>
          <Textarea
            id="wh-edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            rows={2}
          />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-(--text-primary)">URL (read-only)</span>
          <p
            className="truncate rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm text-(--text-secondary)"
            title={endpoint.url}
          >
            {endpoint.url}
          </p>
          <p className="mt-1 text-xs text-(--text-muted)">
            URL changes require deleting this endpoint and creating a new one.
          </p>
        </div>

        {!isAutoDisabled ? (
          <div>
            <label htmlFor="wh-edit-status" className="mb-1 block text-sm font-medium text-(--text-primary)">
              Status
            </label>
            <select
              id="wh-edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PAUSED")}
              disabled={submitting}
              className="h-11 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
            >
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
            </select>
          </div>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-(--text-primary)">
            Events <span className="text-(--color-danger)">*</span>
          </legend>
          <ul className="space-y-2">
            {WEBHOOK_EVENT_NAMES.map((ev) => (
              <li key={ev} className="flex items-start gap-2">
                <input
                  id={`wh-edit-ev-${ev}`}
                  type="checkbox"
                  checked={events.has(ev)}
                  onChange={() => toggleEvent(ev)}
                  disabled={submitting}
                  className="mt-1 h-4 w-4 rounded border-(--border-subtle)"
                />
                <label htmlFor={`wh-edit-ev-${ev}`} className="text-sm text-(--text-secondary)">
                  {WEBHOOK_EVENT_LABELS[ev]}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void handleSubmit()} loading={submitting}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
