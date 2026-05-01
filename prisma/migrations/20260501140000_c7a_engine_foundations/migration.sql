-- AlterEnum
ALTER TYPE "RecordEventType" ADD VALUE 'FINANCE_ASSIGNED';

-- Seed: feature flag for assignment engine (id required — FeatureFlag has no DB default)
INSERT INTO "FeatureFlag" ("id", "code", "description")
VALUES (
  'cffeatureflag0000c7a000001',
  'FT_ASSIGNMENT_ENGINE_ENABLED',
  'Enables Finance Assignment Engine evaluation per tenant'
)
ON CONFLICT ("code") DO NOTHING;
