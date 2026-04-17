/**
 * Fetch latest Subscription from DB and GET /subscriptions/{id} from Paddle. Requires DATABASE_URL + .env.local.
 * Usage: npx tsx scripts/check-paddle-subscription.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });

  const sub = await prisma.subscription.findFirst({
    select: {
      providerSubscriptionId: true,
      billingInterval: true,
      billingPlanCode: true,
    },
    orderBy: { id: "desc" },
  });

  if (!sub?.providerSubscriptionId) {
    console.log("No subscription found");
    await prisma.$disconnect();
    return;
  }

  console.log("DB subscription:", sub);

  const env = process.env;
  const base =
    env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const key = env.PADDLE_API_KEY;

  if (!key) {
    console.log("PADDLE_API_KEY not set");
    await prisma.$disconnect();
    return;
  }

  const res = await fetch(`${base}/subscriptions/${sub.providerSubscriptionId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  const json = await res.json();
  console.log("Paddle subscription data:");
  console.log(JSON.stringify(json?.data, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
