"use client";

import { useTheme, type Theme } from "@/components/theme/theme-provider";

const OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
}> = [
  {
    value: "dark",
    label: "Dark",
    description: "Recommended. Best contrast for long sessions.",
  },
  {
    value: "light",
    label: "Light",
    description: "Clean, light-first palette for bright environments.",
  },
  {
    value: "system",
    label: "System",
    description: "Automatically matches your device appearance.",
  },
];

export default function ThemeSelect() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-(--text-primary)">Appearance</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Choose how the interface looks for your account.
        </p>
      </div>

      <div className="space-y-3">
        {OPTIONS.map((opt) => {
          const checked = theme === opt.value;

          return (
            <label
              key={opt.value}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                checked
                  ? "border-(--color-primary) bg-(--bg-surface-elev)"
                  : "border-(--border-subtle) bg-(--bg-surface) hover:bg-(--bg-surface-elev)",
              ].join(" ")}
            >
              <input
                type="radio"
                name="theme"
                value={opt.value}
                checked={checked}
                onChange={() => setTheme(opt.value)}
                className="mt-1 h-4 w-4 accent-(--color-primary)"
              />

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-(--text-primary)">{opt.label}</span>
                  {opt.value === "dark" ? (
                    <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-0.5 text-[11px] font-medium text-(--text-secondary)">
                      Default
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-sm text-(--text-secondary)">{opt.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
