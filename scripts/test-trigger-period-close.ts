async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  // Local dev uses `next dev --experimental-https` — use HTTPS unless NEXTAUTH_URL is set.
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not set in .env.local");
    process.exit(1);
  }

  console.log(`Calling period-close at ${baseUrl}/api/internal/cron/billing/period-close`);

  const res = await fetch(`${baseUrl}/api/internal/cron/billing/period-close`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${text}`);
}
main().catch(console.error);
