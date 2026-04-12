async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const base =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const key = process.env.PADDLE_API_KEY!;
  const subId = "sub_01knztad0h3m4wrwfqkwm0qvfa";

  const res = await fetch(`${base}/subscriptions/${subId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json()) as { data?: Record<string, unknown> };
  const data = json?.data;

  console.log("=== PADDLE STATE AFTER PERIOD-CLOSE ===");
  console.log(`status: ${data?.status}`);
  console.log(`billing_cycle: ${JSON.stringify(data?.billing_cycle)}`);
  console.log(`next_billed_at: ${data?.next_billed_at}`);
  const items = data?.items as
    | Array<{ price?: { id?: string; description?: string; unit_price?: { amount?: string } } }>
    | undefined;
  console.log(`items[0].price.id: ${items?.[0]?.price?.id}`);
  console.log(`items[0].price.description: ${items?.[0]?.price?.description}`);
  console.log(`items[0].price.unit_price: ${JSON.stringify(items?.[0]?.price?.unit_price)}`);
  console.log(`scheduled_change: ${JSON.stringify(data?.scheduled_change)}`);

  const dataRec = data as Record<string, unknown> | undefined;
  console.log(`\n=== VERIFICATION (Annual Pro → Free / Cancel) ===`);
  console.log(`status: ${data?.status}`);
  console.log(`billing_cycle: ${JSON.stringify(data?.billing_cycle)}`);
  console.log(`next_billed_at: ${data?.next_billed_at}`);
  console.log(`scheduled_change: ${JSON.stringify(data?.scheduled_change)}`);
  console.log(`canceled_at: ${dataRec?.canceled_at}`);
  console.log(`current_billing_period: ${JSON.stringify(data?.current_billing_period)}`);
  console.log(`items[0].price.description: ${items?.[0]?.price?.description}`);

  const txRes = await fetch(
    `${base}/transactions?subscription_id=${encodeURIComponent(subId)}&per_page=5&order_by=billed_at[DESC]`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (txRes.ok) {
    const txJson = (await txRes.json()) as {
      data?: Array<{
        id?: string;
        origin?: string;
        status?: string;
        billed_at?: string;
        details?: { totals?: { total?: string } };
      }>;
    };
    console.log(`\n=== RECENT TRANSACTIONS ===`);
    for (const tx of (txJson?.data ?? []).slice(0, 5)) {
      console.log(
        `  ${tx.id} | origin: ${tx.origin} | status: ${tx.status} | total: ${tx.details?.totals?.total} cents | billed: ${tx.billed_at}`,
      );
    }
  } else {
    const errText = await txRes.text();
    console.log(`\n=== RECENT TRANSACTIONS ===`);
    console.log(`Failed: ${txRes.status} ${errText.slice(0, 400)}`);
  }
}
main().catch(console.error);
