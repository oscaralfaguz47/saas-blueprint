"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { getApiErrorMessage } from "@/lib/api-client";
import { WEBHOOK_EVENT_NAMES } from "@/lib/webhooks/event-catalog";
import { WEBHOOK_EVENT_LABELS } from "./event-labels";

type Props = {
  open: boolean;
  onClose: () => void;
  onPlanBlocked: () => void;
  onSuccessWithSecret: (secret: string) => void;
  onCreated: () => void;
};

export function CreateEndpointModal({
  open,
  onClose,
  onPlanBlocked,
  onSuccessWithSecret,
  onCreated,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setUrl("");
    setEvents(new Set());
    setFormError(null);
  }, [open]);

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
    if (!url.trim()) {
      setFormError("URL is required.");
      return;
    }
    if (events.size < 1) {
      setFormError("Select at least one event.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/tenant/webhook-endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          url: url.trim(),
          subscribedEvents: [...events],
        }),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { secret?: string };
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

      const secret = data.data?.secret;
      if (typeof secret !== "string" || !secret) {
        toast.addToast("error", "Created endpoint but secret was missing. Rotate the secret from the list.");
        onCreated();
        onClose();
        return;
      }

      onClose();
      onCreated();
      onSuccessWithSecret(secret);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create webhook endpoint"
      description="Subscribe to workspace events delivered to your HTTPS URL."
      closeDisabled={submitting}
    >
      <div className="space-y-4">
        {formError ? (
          <p className="text-sm text-(--color-danger)" role="alert">
            {formError}
          </p>
        ) : null}

        <div>
          <label htmlFor="wh-create-name" className="mb-1 block text-sm font-medium text-(--text-primary)">
            Name <span className="text-(--color-danger)">*</span>
          </label>
          <Input
            id="wh-create-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="wh-create-desc" className="mb-1 block text-sm font-medium text-(--text-primary)">
            Description
          </label>
          <Textarea
            id="wh-create-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            rows={2}
          />
        </div>

        <div>
          <label htmlFor="wh-create-url" className="mb-1 block text-sm font-medium text-(--text-primary)">
            URL <span className="text-(--color-danger)">*</span>
          </label>
          <Input
            id="wh-create-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
            placeholder="https://example.com/webhooks/relitrue"
            autoComplete="off"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-(--text-primary)">
            Events <span className="text-(--color-danger)">*</span>
          </legend>
          <ul className="space-y-2">
            {WEBHOOK_EVENT_NAMES.map((ev) => (
              <li key={ev} className="flex items-start gap-2">
                <input
                  id={`wh-ev-${ev}`}
                  type="checkbox"
                  checked={events.has(ev)}
                  onChange={() => toggleEvent(ev)}
                  disabled={submitting}
                  className="mt-1 h-4 w-4 rounded border-(--border-subtle)"
                />
                <label htmlFor={`wh-ev-${ev}`} className="text-sm text-(--text-secondary)">
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
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
