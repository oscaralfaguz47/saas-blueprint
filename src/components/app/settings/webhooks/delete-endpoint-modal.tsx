"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api-client";

type Props = {
  open: boolean;
  endpoint: { id: string; name: string; url: string } | null;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteEndpointModal({ open, endpoint, onClose, onDeleted }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!endpoint) return null;

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/webhook-endpoints/${endpoint.id}`, {
        method: "DELETE",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.addToast("error", getApiErrorMessage(res, data));
        return;
      }
      toast.addToast("success", "Webhook endpoint removed.");
      onDeleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete webhook endpoint?"
      closeDisabled={submitting}
    >
      <p className="text-sm text-(--text-secondary)">
        Delete webhook endpoint <strong className="text-(--text-primary)">{endpoint.name}</strong>? This stops
        delivery to:
      </p>
      <p className="mt-2 truncate text-sm text-(--text-muted)" title={endpoint.url}>
        {endpoint.url}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => void handleDelete()}
          loading={submitting}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
