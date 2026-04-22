"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/container";
import { IconAlertCircle } from "@/components/ui/icons";

export default function RequestsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RequestsError]", error);
  }, [error]);

  return (
    <Container>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-danger-soft)">
          <IconAlertCircle size={24} className="text-(--color-danger)" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Failed to load requests
          </h2>
          <p className="text-sm text-(--text-muted)">
            Something went wrong. Your data is safe.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
        >
          Try again
        </button>
      </div>
    </Container>
  );
}
