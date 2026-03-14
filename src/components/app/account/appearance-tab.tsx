"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { Spinner } from "@/components/ui/spinner";

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

  const [savingTheme, setSavingTheme] = useState<Theme | null>(null);

  const currentTheme: Theme =
    initialMode === "LIGHT" ? "light" : initialMode === "DARK" ? "dark" : "system";

  const handleChange = async (value: Theme) => {
    if (savingTheme) return; // Prevent duplicate requests
    setSavingTheme(value);
    setStatus("saving");
    try {
      const res = await apiFetch("/api/account/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: THEME_TO_MODE[value] }),
      });
      if (!res.ok) {
        setStatus("error");
        setSavingTheme(null);
      } else {
        setTheme(value);
        setStatus("idle");
        setSavingTheme(null);
        router.refresh();
      }
    } catch {
      setStatus("error");
      setSavingTheme(null);
    }
  };

  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4 sm:p-6">
      <h2 className="text-base font-semibold text-(--text-primary)">Appearance</h2>
      <p className="mt-1 text-sm text-(--text-secondary)">
        Choose how the interface looks. Changes apply immediately.
      </p>
      <div className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
        {OPTIONS.map((opt) => {
          const isSelected = (theme ?? currentTheme) === opt.value;
          const isSavingThisOpt = savingTheme === opt.value;
          const isSavingAnything = savingTheme !== null;

          return (
            <label
              key={opt.value}
              className={[
                "flex items-start gap-3 rounded-xl border p-3 transition-colors sm:p-4",
                isSelected
                  ? "border-(--color-primary) bg-(--bg-surface-elev)"
                  : "border-(--border-subtle) bg-(--bg-surface) hover:bg-(--bg-surface-elev)",
                isSavingAnything ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              ].join(" ")}
            >
              <input
                type="radio"
                name="appearance"
                value={opt.value}
                checked={isSelected}
                disabled={isSavingAnything}
                onChange={() => handleChange(opt.value)}
                className="mt-1 h-4 w-4 accent-(--color-primary) disabled:cursor-not-allowed"
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div>
                  <span className="text-sm font-semibold text-(--text-primary)">{opt.label}</span>
                  <p className="mt-1 text-sm text-(--text-secondary)">{opt.description}</p>
                </div>
                {isSavingThisOpt && <Spinner className="shrink-0 text-(--color-primary)" />}
              </div>
            </label>
          );
        })}
      </div>
      {status === "error" && (
        <p className="mt-4 text-sm text-(--color-danger)">Failed to save preference. Try again.</p>
      )}
    </div>
  );
}
