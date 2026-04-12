"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

type JobId = "billing-period-close" | "background-jobs";

type JobDefinition = {
  id: JobId;
  label: string;
  description: string;
  endpoint: string;
  schedule: string;
};

const JOBS: JobDefinition[] = [
  {
    id: "billing-period-close",
    label: "Billing period close",
    description:
      "Closes expired billing periods, creates rollover lots, and applies pending plan changes (downgrades to free, paid downgrades at period end).",
    endpoint: "/api/internal/cron/billing/period-close",
    schedule: "Daily at 1:00 AM UTC",
  },
  {
    id: "background-jobs",
    label: "Background jobs processor",
    description:
      "Processes all pending background jobs (emails, notifications, cleanup tasks) and enqueues the daily notification cleanup job.",
    endpoint: "/api/internal/cron/jobs",
    schedule: "Every 5 minutes",
  },
];

type RunStatus = {
  status: "ok" | "error";
  httpStatus: number;
  durationMs: number;
  result: unknown;
};

type JobState = {
  running: boolean;
  lastRun: RunStatus | null;
  lastRunAt: string | null;
};

export function AdminCronJobsClient() {
  const [jobStates, setJobStates] = useState<Record<JobId, JobState>>(() =>
    Object.fromEntries(JOBS.map((j) => [j.id, { running: false, lastRun: null, lastRunAt: null }])) as Record<
      JobId,
      JobState
    >
  );

  const runJob = async (jobId: JobId) => {
    setJobStates((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], running: true },
    }));

    try {
      const res = await fetch(`/api/admin/cron/${jobId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      const data = (json?.data ?? json) as RunStatus;

      setJobStates((prev) => ({
        ...prev,
        [jobId]: {
          running: false,
          lastRun: data,
          lastRunAt: new Date().toLocaleTimeString(),
        },
      }));
    } catch (e) {
      setJobStates((prev) => ({
        ...prev,
        [jobId]: {
          running: false,
          lastRun: {
            status: "error",
            httpStatus: 0,
            durationMs: 0,
            result: { error: e instanceof Error ? e.message : "Unknown error" },
          },
          lastRunAt: new Date().toLocaleTimeString(),
        },
      }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-(--color-warning)/40 bg-(--color-warning)/5 px-4 py-3">
        <p className="text-sm font-medium text-(--color-warning)">
          Development tool — these jobs interact with real data and external services (Paddle). Do not run in
          production unless you understand the consequences.
        </p>
      </div>

      <div className="space-y-3">
        {JOBS.map((job) => {
          const state = jobStates[job.id];
          const lastRun = state.lastRun;

          return (
            <div key={job.id} className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-(--text-primary)">{job.label}</p>
                    {lastRun && (
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          lastRun.status === "ok"
                            ? "bg-(--color-success)/10 text-(--color-success)"
                            : "bg-(--color-danger)/10 text-(--color-danger)",
                        ].join(" ")}
                      >
                        {lastRun.status === "ok" ? "Success" : "Error"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-(--text-muted)">{job.description}</p>
                  <p className="mt-1 font-mono text-xs text-(--text-muted)">{job.endpoint}</p>
                  <p className="mt-1 text-xs text-(--text-muted)">
                    <span className="inline-flex items-center gap-1">
                      <span>🕐</span>
                      <span>{job.schedule}</span>
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void runJob(job.id)}
                  disabled={state.running}
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md bg-(--color-primary) px-3 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                >
                  {state.running ? (
                    <>
                      <Spinner size="sm" />
                      Running…
                    </>
                  ) : (
                    "Run now"
                  )}
                </button>
              </div>

              {lastRun && (
                <div className="mt-3 rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-(--text-muted)">
                      Last run at {state.lastRunAt} — {lastRun.durationMs}ms
                      {lastRun.httpStatus > 0 && ` — HTTP ${lastRun.httpStatus}`}
                    </span>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-(--text-secondary)">
                    {JSON.stringify(lastRun.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
