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

function readThemeFromStorage(): Theme {
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

type ThemeProviderProps = {
  children: React.ReactNode;
  /** L1: Server-driven appearance (from User.appearance). Used as initial value before localStorage. */
  initialTheme?: Theme | null;
};

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  // Prefer initialTheme from server (L1), then localStorage, then "dark" for hydration.
  const [theme, setThemeState] = useState<Theme>(isTheme(initialTheme) ? initialTheme : "dark");

  useEffect(() => {
    const fromServer = isTheme(initialTheme) ? initialTheme : null;
    setThemeState(fromServer ?? readThemeFromStorage());
  }, [initialTheme]);

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
