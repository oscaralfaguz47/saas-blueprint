"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";

type Status = "idle" | "submitting" | "error";

function getApiMessage(res: { error?: string; message?: string }) {
  if (res.message) return res.message;
  if (res.error === "CONFLICT")
    return "A workspace with this name already exists. Please choose a different name.";
  if (res.error === "VALIDATION_ERROR") return "Please check the workspace name and try again.";
  return "Something went wrong. Please try again.";
}

export default function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setStatus("submitting");

    try {
      const res = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = (await res.json()) as { data?: { tenant?: unknown }; error?: string; message?: string };

      if (!res.ok) {
        setErrorMessage(getApiMessage(data));
        setStatus("error");
        return;
      }

      router.push("/app/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  const isLoading = status === "submitting";

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="workspace-name"
            className="block text-sm font-medium text-(--text-primary)"
          >
            Workspace name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Inc"
            disabled={isLoading}
            autoFocus
            autoComplete="organization"
            className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "workspace-error" : undefined}
          />
          <p className="mt-1 text-xs text-(--text-muted)">
            A short URL (e.g. acme-inc) will be generated from this name.
          </p>
        </div>

        {status === "error" && errorMessage ? (
          <div
            id="workspace-error"
            role="alert"
            className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition hover:bg-(--color-primary-hover) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoading ? "Creating…" : "Create workspace"}
          </button>
          <ButtonLink href="/app/dashboard" variant="secondary">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
