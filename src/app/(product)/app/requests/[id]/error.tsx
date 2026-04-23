"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/container";
import { IconAlertCircle } from "@/components/ui/icons";

export default function RequestDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RequestDetailError]", error);
  }, [error]);

  const router = useRouter();

  return (
    <Container>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-danger-soft)">
          <IconAlertCircle size={24} className="text-(--color-danger)" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Failed to load this request
          </h2>
          <p className="text-sm text-(--text-muted)">
            It may have been deleted or you may not have access.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/app/requests")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
          >
            Back to requests
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            Try again
          </button>
        </div>
      </div>
    </Container>
  );
}
