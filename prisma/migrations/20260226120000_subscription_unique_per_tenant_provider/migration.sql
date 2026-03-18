-- Deduplicate Subscription: keep one row per (tenantId, provider).
-- Keep the row with latest currentPeriodEnd, then latest id. (currentEntitlementPlanCode is added in a later migration.)
-- Reassign BillingEvents from removed rows to the kept row, then delete duplicates.
-- Finally add unique constraint so one subscription per tenant per provider.
-- Only processes rows where provider is not null (e.g. 'paddle').

WITH ranked AS (
  SELECT
    id,
    "tenantId",
    "provider",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "provider"
      ORDER BY
        "currentPeriodEnd" DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM "Subscription"
  WHERE "provider" IS NOT NULL
),
losers AS (
  SELECT r.id, w.id AS winner_id
  FROM ranked r
  INNER JOIN ranked w ON w."tenantId" = r."tenantId" AND w."provider" = r."provider" AND w.rn = 1
  WHERE r.rn > 1
)
UPDATE "BillingEvent" AS be
SET "subscriptionId" = l.winner_id
FROM losers l
WHERE be."subscriptionId" = l.id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "provider"
      ORDER BY
        "currentPeriodEnd" DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM "Subscription"
  WHERE "provider" IS NOT NULL
)
DELETE FROM "Subscription"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "Subscription_tenantId_provider_key" ON "Subscription"("tenantId", "provider");
