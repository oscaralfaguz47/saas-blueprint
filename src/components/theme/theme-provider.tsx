"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { APP_THEME_STORAGE_KEY } from "@/components/theme/theme-bootstrap";

export type Theme = "dark" | "light" | "system";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function readThemeFromStorage(): Theme {
  try {
    const saved = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : "dark";
  } catch {
    return "dark";
  }
}

function applyThemeToDocument(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

type ThemeProviderProps = {
  children: React.ReactNode;
  /** L1: Server-driven appearance (from User.appearance). Used as initial value before localStorage. */
  initialTheme?: Theme | null;
};

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
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
      window.localStorage.setItem(APP_THEME_STORAGE_KEY, t);
    } catch {
      // ignore
    }

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
