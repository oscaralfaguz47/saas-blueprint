"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Props = {
  open: boolean;
  secret: string;
  onAcknowledge: () => void;
};

export function SecretDisplayDialog({ open, secret, onAcknowledge }: Props) {
  const toast = useToast();
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(secret);
      toast.addToast("success", "Secret copied to clipboard.");
    } catch {
      toast.addToast("error", "Could not copy. Copy the secret manually.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {}}
      title="Save your webhook secret"
      description="This secret won’t be shown again. Copy it now."
      closeDisabled
      hideCloseButton
      allowOverlayClose={false}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => void handleCopy()} loading={copying}>
            Copy secret
          </Button>
          <Button type="button" variant="primary" onClick={onAcknowledge}>
            I&apos;ve saved my secret
          </Button>
        </div>
      }
    >
      <p className="text-sm font-medium text-(--color-danger)">
        This secret won&apos;t be shown again. Copy it now.
      </p>
      <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 text-xs break-all text-(--text-primary)">
        {secret}
      </pre>
    </Dialog>
  );
}
