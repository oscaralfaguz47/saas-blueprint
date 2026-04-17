async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const base =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const key = process.env.PADDLE_API_KEY!;

  console.log("=== ALL PADDLE SUBSCRIPTIONS (ALL STATUSES) ===");

  const allStatuses = ["active", "past_due", "paused", "trialing", "canceled"];

  for (const status of allStatuses) {
    const res = await fetch(`${base}/subscriptions?status=${status}&per_page=50`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) continue;
    const json = (await res.json()) as any;
    const subs = json?.data ?? [];
    if (subs.length === 0) continue;

    console.log(`\n--- Status: ${status.toUpperCase()} (${subs.length}) ---`);
    for (const s of subs) {
      console.log(
        `  ${s.id} | customer: ${s.customer_id} | plan: ${s.custom_data?.planCode ?? "unknown"} | interval: ${s.billing_cycle?.interval} | next: ${s.next_billed_at ?? "null"}`,
      );
    }
  }

  console.log("\n=== ALL PADDLE CUSTOMERS ===");
  const custRes = await fetch(`${base}/customers?per_page=50`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (custRes.ok) {
    const custJson = (await custRes.json()) as any;
    const customers = custJson?.data ?? [];
    console.log(`Total customers: ${customers.length}`);
    for (const c of customers) {
      console.log(`  ${c.id} | email: ${c.email} | status: ${c.status}`);
    }
  }
}
main().catch(console.error);
