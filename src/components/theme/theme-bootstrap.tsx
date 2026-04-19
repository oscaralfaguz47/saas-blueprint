"use client";

// App shell only: persisted user preference. Public routes ignore this and stay dark.
export const APP_THEME_STORAGE_KEY = "relitrue.theme.app";

export default function ThemeBootstrap() {
  const key = APP_THEME_STORAGE_KEY;
  const code = `
    try {
      var path = window.location.pathname || "";
      var isAppShell = path.indexOf("/app") === 0 || path.indexOf("/admin") === 0;
      if (!isAppShell) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        var saved = window.localStorage.getItem("${key}");
        if (saved === "light" || saved === "dark" || saved === "system") {
          document.documentElement.setAttribute("data-theme", saved);
        } else {
          document.documentElement.setAttribute("data-theme", "dark");
        }
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
