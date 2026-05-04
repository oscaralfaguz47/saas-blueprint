"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { getApiErrorMessage } from "@/lib/api-client";

type Props = {
  open: boolean;
  endpoint: { id: string; name: string } | null;
  onClose: () => void;
  onPlanBlocked: () => void;
  onSuccessWithSecret: (secret: string) => void;
};

export function RotateSecretModal({
  open,
  endpoint,
  onClose,
  onPlanBlocked,
  onSuccessWithSecret,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!endpoint) return null;

  const handleRotate = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/webhook-endpoints/${endpoint.id}/rotate-secret`, {
        method: "POST",
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
        toast.addToast("error", getApiErrorMessage(res, data));
        return;
      }

      const secret = data.data?.secret;
      if (typeof secret !== "string" || !secret) {
        toast.addToast("error", "Secret was missing in the response.");
        return;
      }

      onClose();
      onSuccessWithSecret(secret);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rotate webhook secret?"
      closeDisabled={submitting}
    >
      <p className="text-sm text-(--text-secondary)">
        Rotate secret for <strong className="text-(--text-primary)">{endpoint.name}</strong>? Existing integrations
        will fail until you update the secret at your receiver.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => void handleRotate()} loading={submitting}>
          Rotate secret
        </Button>
      </div>
    </Dialog>
  );
}
