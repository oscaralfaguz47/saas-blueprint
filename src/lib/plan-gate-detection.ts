/**
 * Detects API responses where the server blocked an action due to plan / upgrade (403 UPGRADE_REQUIRED).
 * TD-D7-001: Quota-style gates (e.g. request creation limits) stay on dedicated paths — do not reuse for quota UX.
 */
export function isUpgradeRequiredFromApiResponse(json: unknown): boolean {
  const err = (json as { error?: { code?: string; details?: unknown } } | null)?.error;
  if (err?.code === "UPGRADE_REQUIRED") return true;
  const d = err?.details;
  return typeof d === "object" && d !== null && (d as { code?: string }).code === "UPGRADE_REQUIRED";
}
