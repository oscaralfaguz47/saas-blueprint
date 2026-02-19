"use client";

import { useEffect, useState, useCallback } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ButtonLink } from "@/components/ui/button";
import { useApiFetch } from "@/hooks/use-api-fetch";

type BillingSummary = {
  planCode: string;
  subscriptionStatus: string;
  periodStart: string;
  periodEnd: string;
  included: number;
  rolloverAvailable: number;
  used: number;
  overageEstimate: number;
  threshold80: boolean;
  threshold100: boolean;
  overageCapReached: boolean;
  meters: {
    pdfExports: { included: number; used: number; overageEstimateCents: number };
    zipExports: { included: number; used: number };
  };
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (through ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
  } catch {
    return "";
  }
}

export function WorkspaceBillingTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const apiFetch = useApiFetch();

  const fetchSummary = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      setLoading(true);
      try {
        const res = await apiFetch("/api/billing/summary", {
          signal,
          showToastOnError: false,
        });
        if (signal?.aborted) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            (data as { message?: string }).message ?? "Failed to load billing summary."
          );
          setSummary(null);
          return;
        }
        const json = await res.json();
        setSummary((json.data as BillingSummary) ?? null);
      } catch (e) {
        if (signal?.aborted) return;
        setError("Failed to load billing summary.");
        setSummary(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSummary(controller.signal);
    return () => controller.abort();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-(--text-muted)">Loading billing…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--card) p-4">
        <p className="text-sm text-(--destructive)">{error}</p>
        <button
          type="button"
          onClick={() => fetchSummary()}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-(--border-subtle) bg-(--card) p-4">
        <p className="text-sm text-(--text-muted)">
          No billing data available. Create or select a workspace with a plan to see usage.
        </p>
      </div>
    );
  }

  const allowance = summary.included + summary.rolloverAvailable;
  const usagePct =
    allowance > 0
      ? Math.min(100, (summary.used / allowance) * 100)
      : 0;
  const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-(--text-primary)">Billing</h2>
        <p className="text-sm text-(--text-secondary)">
          Plan, usage, and overage for the current billing period.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-(--border-subtle) bg-(--card) p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-(--text-primary)">
              Plan: {planLabel}
            </p>
            <p className="text-xs text-(--text-muted)">
              Status: {summary.subscriptionStatus}
            </p>
          </div>
          <p className="text-xs text-(--text-muted)">
            {formatPeriod(summary.periodStart, summary.periodEnd)}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-(--text-secondary)">Requests</span>
            <span className="text-(--text-primary)">
              {summary.used} / {allowance > 0 ? allowance : summary.included}
              {summary.rolloverAvailable > 0 &&
                ` (${summary.rolloverAvailable} rollover)`}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-(--border-subtle)"
            role="progressbar"
            aria-valuenow={usagePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                summary.threshold100
                  ? "bg-(--destructive)"
                  : summary.threshold80
                    ? "bg-amber-500"
                    : "bg-(--color-primary)"
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {summary.threshold80 && !summary.threshold100 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You&apos;ve used 80% or more of your request allowance.
            </p>
          )}
          {summary.threshold100 && (
            <p className="text-xs text-(--destructive)">
              You&apos;ve reached your request allowance for this period.
              {summary.planCode === "free" &&
                " Upgrade to add more requests."}
            </p>
          )}
        </div>

        {summary.overageEstimate > 0 && (
          <div className="rounded border border-(--border-subtle) bg-(--muted) p-2 text-sm">
            <span className="text-(--text-secondary)">Overage estimate: </span>
            <span className="font-medium">
              ${(summary.overageEstimate / 100).toFixed(2)}
            </span>
            {summary.overageCapReached && (
              <p className="mt-1 text-xs text-(--destructive)">
                Overage cap reached for this period.
              </p>
            )}
          </div>
        )}

        {(summary.planCode === "free" || summary.threshold80) && (
          <div className="pt-2">
            <ButtonLink href="/app/settings/workspace?tab=billing">
              Upgrade plan
            </ButtonLink>
            <p className="mt-1 text-xs text-(--text-muted)">
              Contact support or use the upgrade flow when available to change plan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
