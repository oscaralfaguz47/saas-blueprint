"use client";

import Link from "next/link";

export const PLAN_GATE_BILLING_HREF = "/app/settings/workspace?tab=billing";

const DEFAULT_SECTION_TITLE = "Plan upgrade required";
const DEFAULT_SECTION_DESC = "Some features require a higher plan.";
const DEFAULT_MODAL_DESC = "Upgrade required to use this feature.";

export type PlanGateBannerProps = {
  visible: boolean;
  variant: "section" | "modal";
  title?: string;
  /** undefined → default; string → override; null (modal) → link-only under alerts */
  description?: string | null;
};

export function PlanGateBanner({
  visible,
  variant,
  title,
  description,
}: PlanGateBannerProps) {
  if (!visible) return null;

  if (variant === "section") {
    const resolvedTitle = title ?? DEFAULT_SECTION_TITLE;
    const resolvedDesc =
      description === undefined ? DEFAULT_SECTION_DESC : description;

    return (
      <div
        role="status"
        className="rounded-lg border border-(--border-subtle) bg-(--color-info-soft) px-4 py-3 text-sm text-(--text-secondary)"
      >
        <p className="font-medium text-(--text-primary)">{resolvedTitle}</p>
        <p className="mt-1">
          {resolvedDesc !== null ? (
            <>
              {resolvedDesc}{" "}
            </>
          ) : null}
          <Link
            href={PLAN_GATE_BILLING_HREF}
            className="text-(--color-primary) hover:underline"
          >
            View billing
          </Link>
        </p>
      </div>
    );
  }

  if (description === null) {
    return (
      <div className="mt-2">
        <Link
          href={PLAN_GATE_BILLING_HREF}
          className="font-medium text-(--color-primary) hover:underline"
        >
          View billing
        </Link>
      </div>
    );
  }

  const resolvedDesc = description === undefined ? DEFAULT_MODAL_DESC : description;

  return (
    <p className="rounded-lg bg-(--color-primary-soft) px-3 py-2 text-xs text-(--text-primary)">
      {resolvedDesc}{" "}
      <Link
        href={PLAN_GATE_BILLING_HREF}
        className="font-medium text-(--color-primary) underline underline-offset-2"
      >
        View billing
      </Link>
    </p>
  );
}
