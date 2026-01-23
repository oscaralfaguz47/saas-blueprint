"use client";

import { useEffect } from "react";

const STORAGE_KEY = "atl.theme";

export default function ThemeBootstrap() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        document.documentElement.setAttribute("data-theme", saved);
      } else {
        // Product default (can be dark). We set explicitly for consistency.
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  return null;
}
