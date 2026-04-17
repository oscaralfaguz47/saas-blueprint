async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const base =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const key = process.env.PADDLE_API_KEY!;

  const customerId = "ctm_01kj0ygep38fcna5b65c0qcjxe";

  const creditRes = await fetch(`${base}/customers/${customerId}/credit-balances`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log(`Credit balance status: ${creditRes.status}`);
  if (creditRes.ok) {
    const json = (await creditRes.json()) as any;
    console.log("Credit balances:", JSON.stringify(json, null, 2));
  } else {
    console.log(await creditRes.text());
  }

  const subRes = await fetch(
    `${base}/subscriptions?customer_id=${customerId}&status=active&per_page=5`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (subRes.ok) {
    const json = (await subRes.json()) as any;
    const subs = json?.data ?? [];
    console.log(`\nActive subs for ${customerId}: ${subs.length}`);
    for (const sub of subs) {
      console.log(`\nSub: ${sub.id}`);
      const nextRes = await fetch(`${base}/subscriptions/${sub.id}/next-transaction`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (nextRes.ok) {
        const nextJson = (await nextRes.json()) as any;
        console.log("Next transaction:", JSON.stringify(nextJson?.data?.totals, null, 2));
        console.log(
          "Line items:",
          JSON.stringify(
            nextJson?.data?.details?.line_items?.map((l: any) => ({
              amount: l.totals?.total,
              credit: l.totals?.credit,
              proration: l.proration,
            })),
            null,
            2,
          ),
        );
      } else {
        console.log(`next-transaction status: ${nextRes.status} ${await nextRes.text()}`);
      }
    }
  }
}
main().catch(console.error);
