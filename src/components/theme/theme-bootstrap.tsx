"use client";

const STORAGE_KEY = "atl.theme";

// Run synchronously before React hydrates to prevent layout shift / FOUC
export default function ThemeBootstrap() {
  const code = `
    try {
      var saved = window.localStorage.getItem("${STORAGE_KEY}");
      if (saved === "light" || saved === "dark" || saved === "system") {
        document.documentElement.setAttribute("data-theme", saved);
      } else {
        // Product default (can be dark). We set explicitly for consistency.
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch (e) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  `;

  return (
    <script
      id="theme-bootstrap"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
