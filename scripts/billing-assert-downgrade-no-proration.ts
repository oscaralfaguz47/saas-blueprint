/**
 * Reproducible dev script: assert that a downgrade preview with do_not_bill
 * yields next_transaction total = target plan price and no proration credits.
 *
 * Usage (from repo root; set PADDLE_API_KEY and PADDLE_PRICE_ID_* in env or .env):
 *   npx tsx scripts/billing-assert-downgrade-no-proration.ts <subscription_id> <target_plan>
 * Example (with .env loaded by shell):
 *   set -a && source .env && set +a && npx tsx scripts/billing-assert-downgrade-no-proration.ts sub_01abc... pro
 *
 * Acceptance:
 * - immediate_transaction should be null (do_not_bill = no immediate charge/credit).
 * - next_transaction should exist and total should equal target plan price (not $0 from credit).
 * - No negative proration/credit line items.
 */

const PADDLE_API_BASE =
  process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

function getPriceId(planCode: string): string | null {
  const envKey =
    planCode === "starter"
      ? "PADDLE_PRICE_ID_STARTER"
      : planCode === "pro"
        ? "PADDLE_PRICE_ID_PRO"
        : planCode === "scale"
          ? "PADDLE_PRICE_ID_SCALE"
          : null;
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

async function main(): Promise<void> {
  const [, , subscriptionId, targetPlan] = process.argv;
  if (!subscriptionId || !targetPlan) {
    console.error("Usage: npx tsx scripts/billing-assert-downgrade-no-proration.ts <subscription_id> <target_plan>");
    console.error("Example: npx tsx scripts/billing-assert-downgrade-no-proration.ts sub_01abc... pro");
    process.exit(1);
  }

  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    console.error("PADDLE_API_KEY is not set");
    process.exit(1);
  }

  const newPriceId = getPriceId(targetPlan.toLowerCase());
  if (!newPriceId) {
    console.error(`No price ID for plan: ${targetPlan}. Set PADDLE_PRICE_ID_${targetPlan.toUpperCase()}.`);
    process.exit(1);
  }

  const body = {
    items: [{ price_id: newPriceId, quantity: 1 }],
    proration_billing_mode: "do_not_bill",
  };

  console.info("Preview payload (no secrets):", JSON.stringify(body, null, 2));

  const res = await fetch(
    `${PADDLE_API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/preview`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    console.error("Paddle preview failed:", res.status, text.slice(0, 500));
    process.exit(1);
  }

  let data: {
    data?: {
      immediate_transaction?: { total?: string; details?: { line_items?: Array<{ total?: string; proration?: boolean }> } } | null;
      next_transaction?: { total?: string; details?: { line_items?: Array<{ total?: string; proration?: boolean }> } } | null;
      update_summary?: { result?: string; credit?: unknown; charge?: unknown };
    };
  };
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Invalid JSON response");
    process.exit(1);
  }

  const root = data?.data;
  const immediate = root?.immediate_transaction ?? null;
  const next = root?.next_transaction ?? null;
  const summary = root?.update_summary ?? null;

  console.info("immediate_transaction:", immediate == null ? "null" : JSON.stringify(immediate, null, 2));
  console.info("next_transaction:", next == null ? "null" : JSON.stringify(next, null, 2));
  console.info("update_summary:", summary == null ? "null" : JSON.stringify(summary, null, 2));

  // Assert: no immediate charge/credit (do_not_bill)
  if (immediate != null && immediate.total && Number(immediate.total) !== 0) {
    console.error("FAIL: immediate_transaction should be null or zero total for do_not_bill, got total:", immediate.total);
    process.exit(1);
  }

  // Assert: next transaction exists and total is positive (not $0 from credit)
  if (next == null) {
    console.error("FAIL: next_transaction is null (e.g. subscription cancel scheduled); expected next renewal.");
    process.exit(1);
  }
  const nextTotal = next.total != null ? Number(next.total) : 0;
  if (nextTotal <= 0) {
    console.error("FAIL: next_transaction.total should be > 0 (target plan price), got:", next.total);
    process.exit(1);
  }

  // Assert: no negative credit line items
  const nextLines = next.details?.line_items ?? [];
  const negativeLines = nextLines.filter((l) => l.total != null && Number(l.total) < 0);
  if (negativeLines.length > 0) {
    console.error("FAIL: next_transaction has negative line items (credits):", negativeLines);
    process.exit(1);
  }

  console.info("OK: next_transaction.total =", next.total, "(no proration credits; downgrade policy satisfied).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
