import "server-only";

/**
 * Returns the name of the link-challenge cookie derived from APP_NAME.
 *
 * APP_NAME="RELITRUE"  → "__relitrue_link_challenge"
 * APP_NAME="My App"    → "__my-app_link_challenge"
 * APP_NAME unset       → "__app_link_challenge"  (safe fallback)
 *
 * Must be called at runtime so that the env var is resolved from the current process.
 */
export function getLinkChallengeCookieName(): string {
  const appName = (process.env.APP_NAME ?? "app")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const slug = appName || "app";
  return `__${slug}_link_challenge`;
}
