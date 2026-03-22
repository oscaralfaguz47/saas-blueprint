export function isSafeInternalRedirect(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  // Must start with / but not // or \/
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/\\")) return false;
  // Must not contain a protocol
  if (/[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) return false;
  return true;
}
