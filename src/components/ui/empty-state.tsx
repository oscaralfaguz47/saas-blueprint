import Link from "next/link";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
};

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-(--border-subtle) bg-(--bg-surface-elev) px-6 py-12 text-center">
      {icon ? <div className="text-(--text-muted)">{icon}</div> : null}
      <h2 className="text-lg font-semibold text-(--text-primary)">{title}</h2>
      {description ? <p className="max-w-md text-sm text-(--text-muted)">{description}</p> : null}
      {action ? (
        "href" in action ? (
          <Link
            href={action.href}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-(--color-primary) px-4 text-sm font-medium text-white hover:opacity-95"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-(--color-primary) px-4 text-sm font-medium text-white hover:opacity-95"
          >
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
