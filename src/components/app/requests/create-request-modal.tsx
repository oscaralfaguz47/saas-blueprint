"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import {
  FinanceRequestWizard,
  type CreateSuccessPayload,
} from "./create-request-form";

type Props = {
  open: boolean;
  onClose: () => void;
  sourceRecordId?: string;
  workspaceCurrency?: string;
};

const STEP_LABELS = ["Category & basics", "Financial details", "Review"] as const;

export function CreateRequestModal({
  open,
  onClose,
  sourceRecordId,
  workspaceCurrency,
}: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [wizardMount, setWizardMount] = useState(0);
  const [linkingSource, setLinkingSource] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [wizardFooter, setWizardFooter] = useState<ReactNode>(null);

  useEffect(() => {
    if (!open) {
      setLinkingSource(false);
      setCurrentStep(1);
      setWizardFooter(null);
    } else {
      setWizardMount((k) => k + 1);
      setCurrentStep(1);
    }
  }, [open]);

  async function handleWizardSuccess(payload: CreateSuccessPayload) {
    if (sourceRecordId && sourceRecordId !== payload.id) {
      setLinkingSource(true);
      try {
        const res = await apiFetch(`/api/records/${sourceRecordId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toRecordId: payload.id, linkType: "RELATED" }),
          showToastOnError: false,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          toast.addToast("error", j.error?.message ?? "Could not link to source request.");
        }
      } catch {
        toast.addToast("error", "Could not link to source request.");
      } finally {
        setLinkingSource(false);
      }
    }

    onClose();
    router.push(`/app/requests/${payload.id}`);
  }

  const isLoading = linkingSource;

  const stepIndicator = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-(--text-muted)">
          Step {currentStep} of 3 — {STEP_LABELS[currentStep - 1]}
        </p>
      </div>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={[
              "h-1 flex-1 rounded-full transition-colors",
              s <= currentStep ? "bg-(--color-primary)" : "bg-(--border-subtle)",
            ].join(" ")}
          />
        ))}
      </div>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={isLoading ? () => {} : onClose}
      title="New financial request"
      contentClassName="max-w-2xl"
      closeDisabled={isLoading}
      headerExtra={stepIndicator}
      footer={wizardFooter ?? undefined}
    >
      {linkingSource && (
        <div className="mb-4 flex items-center gap-2 text-sm text-(--text-muted)">
          <Spinner size="sm" />
          Linking to source request…
        </div>
      )}
      <FinanceRequestWizard
        key={wizardMount}
        variant="modal"
        workspaceCurrency={workspaceCurrency}
        onStepChange={(step) => setCurrentStep(step)}
        onSubmitSuccess={handleWizardSuccess}
        onFooterChange={setWizardFooter}
      />
    </Dialog>
  );
}
