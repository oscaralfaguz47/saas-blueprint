import "server-only";

import { PADDLE_API_BASE, getPaddleApiKey } from "../paddle-api";

/**
 * Clear only the scheduled change on a Paddle subscription (e.g. scheduled cancellation).
 * Sends a single PATCH with { scheduled_change: null } and no other fields.
 * Paddle does not allow combining scheduled_change updates with items/proration in the same request.
 * Used as step 1 of the "resume from scheduled cancellation" two-step flow.
 */
export async function clearScheduledChangeOnly(
  providerSubscriptionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getPaddleApiKey()}`,
        },
        body: JSON.stringify({ scheduled_change: null }),
      }
    );
    const responseText = await res.text();
    if (!res.ok) {
      let requestId: string | undefined;
      try {
        const parsed = JSON.parse(responseText) as { meta?: { request_id?: string } };
        requestId = parsed?.meta?.request_id;
      } catch {
        // ignore
      }
      const msg = requestId
        ? `Paddle clear scheduled change failed: ${res.status} request_id=${requestId} body=${responseText.slice(0, 500)}`
        : `Paddle clear scheduled change failed: ${res.status} ${responseText.slice(0, 500)}`;
      console.error("[clearScheduledChangeOnly]", msg);
      return { ok: false, error: `${res.status}: ${responseText.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[clearScheduledChangeOnly] throw", { providerSubscriptionId, message });
    return { ok: false, error: message };
  }
}
