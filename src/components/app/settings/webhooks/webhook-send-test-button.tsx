"use client";

import { useState } from "react";
import { WebhookEndpointStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { getApiErrorMessage } from "@/lib/api-client";

type WebhookListItem = {
  id: string;
  status: WebhookEndpointStatus;
};

type Props = {
  endpoint: WebhookListItem;
  planBlocked: boolean;
  onPlanBlocked: () => void;
};

export function WebhookSendTestButton({ endpoint, planBlocked, onPlanBlocked }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const send = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tenant/webhook-endpoints/${endpoint.id}/test`, {
        method: "POST",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: {
          result?: {
            status: string;
            httpStatus?: number;
            durationMs?: number;
            errorMessage?: string | null;
          };
        };
        error?: { message?: string; code?: string };
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
      const r = data.data?.result;
      if (r?.status === "SUCCEEDED") {
        const http = r.httpStatus != null ? String(r.httpStatus) : "OK";
        const ms = r.durationMs != null ? String(r.durationMs) : "?";
        toast.addToast("success", `Test delivered (HTTP ${http}, ${ms} ms).`);
      } else {
        toast.addToast("error", r?.errorMessage ?? "Test delivery failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={planBlocked || endpoint.status !== WebhookEndpointStatus.ACTIVE}
      loading={loading}
      onClick={() => void send()}
    >
      Send test
    </Button>
  );
}
