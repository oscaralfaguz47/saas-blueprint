import "server-only";

const PADDLE_API_BASE =
  process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}

/**
 * Create customer portal session (POST /customers/{customer_id}/portal-sessions).
 * Official API: https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session
 * Returns the authenticated portal URL from response data.urls.
 */
export async function getCustomerPortalLink(params: {
  providerCustomerId: string;
  subscriptionIds?: string[];
}): Promise<{ url: string }> {
  const { providerCustomerId, subscriptionIds } = params;
  const res = await fetch(
    `${PADDLE_API_BASE}/customers/${encodeURIComponent(providerCustomerId)}/portal-sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        subscriptionIds?.length
          ? { subscription_ids: subscriptionIds }
          : {}
      ),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle Create Customer Portal Session failed: ${res.status} ${err}`);
  }
  const json = (await res.json()) as {
    data?: {
      url?: string;
      urls?: {
        general?: string | { url?: string };
        customer_portal?: string;
      };
    };
  };
  const d = json?.data;
  let url: string | null = null;
  if (d?.url) url = d.url;
  else if (d?.urls?.customer_portal) url = d.urls.customer_portal;
  else if (d?.urls?.general)
    url =
      typeof d.urls.general === "string"
        ? d.urls.general
        : d.urls.general?.url ?? null;
  if (!url || typeof url !== "string") {
    throw new Error(
      "Paddle Create Customer Portal Session: missing url in response (data.url or data.urls.general or data.urls.customer_portal)"
    );
  }
  return { url };
}
