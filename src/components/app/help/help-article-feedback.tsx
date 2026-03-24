"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = (slug: string) => `kb-helpful-${slug}`;

export function HelpArticleFeedback({ slug }: { slug: string }) {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (raw === "yes") setValue(true);
      else if (raw === "no") setValue(false);
    } catch {
      // ignore
    }
  }, [slug]);

  const choose = useCallback(
    (helpful: boolean) => {
      setValue(helpful);
      try {
        localStorage.setItem(storageKey(slug), helpful ? "yes" : "no");
      } catch {
        // ignore
      }
    },
    [slug]
  );

  return (
    <div className="mt-10 rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-4">
      <p className="text-sm font-medium text-(--text-primary)">Was this helpful?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose(true)}
          className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${
            value === true
              ? "border-(--color-primary) bg-(--nav-active) text-(--text-primary)"
              : "border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:bg-(--nav-hover)"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${
            value === false
              ? "border-(--color-primary) bg-(--nav-active) text-(--text-primary)"
              : "border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:bg-(--nav-hover)"
          }`}
        >
          No
        </button>
        {value !== null ? (
          <span className="flex items-center text-xs text-(--text-muted)">Thanks for your feedback.</span>
        ) : null}
      </div>
    </div>
  );
}
