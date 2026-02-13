"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { useApiFetch } from "@/hooks/use-api-fetch";

const OPTIONS: Array<{ value: Theme; label: string; description: string }> = [
  { value: "light", label: "Light", description: "Clean, light-first palette." },
  { value: "dark", label: "Dark", description: "Recommended. Best contrast for long sessions." },
  { value: "system", label: "System", description: "Matches your device appearance." },
];

const THEME_TO_MODE = { light: "LIGHT", dark: "DARK", system: "SYSTEM" } as const;

type Props = { initialMode: string };

export function AppearanceTab({ initialMode }: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const apiFetch = useApiFetch();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  const currentTheme: Theme =
    initialMode === "LIGHT"
      ? "light"
      : initialMode === "DARK"
        ? "dark"
        : "system";

  const handleChange = async (value: Theme) => {
    setTheme(value);
    setStatus("saving");
    try {
      const res = await apiFetch("/api/account/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: THEME_TO_MODE[value] }),
      });
      if (!res.ok) setStatus("error");
      else {
        setStatus("idle");
        router.refresh();
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
      <h2 className="text-base font-semibold text-(--text-primary)">Appearance</h2>
      <p className="mt-1 text-sm text-(--text-secondary)">
        Choose how the interface looks. Changes apply immediately.
      </p>
      <div className="mt-6 space-y-3">
        {OPTIONS.map((opt) => {
          const checked = (theme ?? currentTheme) === opt.value;
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
                name="appearance"
                value={opt.value}
                checked={checked}
                onChange={() => handleChange(opt.value)}
                className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
              />
              <div className="min-w-0">
                <span className="text-sm font-semibold text-(--text-primary)">{opt.label}</span>
                <p className="mt-1 text-sm text-(--text-secondary)">{opt.description}</p>
              </div>
            </label>
          );
        })}
      </div>
      {status === "error" && (
        <p className="mt-4 text-sm text-(--color-danger)">
          Failed to save preference. Try again.
        </p>
      )}
    </div>
  );
}
