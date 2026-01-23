"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light" | "system";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "atl.theme";

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function readInitialTheme(): Theme {
  // Default global is dark. If user never picked, keep "dark" here.
  // Root layout script already applies saved theme before paint; this keeps React in sync.
  if (typeof window === "undefined") return "dark";

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : "dark";
  } catch {
    return "dark";
  }
}

function applyThemeToDocument(theme: Theme) {
  // If you prefer relying on :root default for dark, you can remove attribute for "dark".
  // But being explicit is simpler/consistent.
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ✅ No setState in effects: we hydrate from localStorage using lazy initializer.
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme());

  // ✅ Effect only syncs DOM with current React state.
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);

    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }

    // DOM will sync in the effect; we can also optimistically apply immediately for snappier UX.
    applyThemeToDocument(t);
  }

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
