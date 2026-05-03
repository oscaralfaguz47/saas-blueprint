-- E-3.5: AES-GCM encrypted secrets + dedupe deliveries per endpoint/event.
-- Preconditions: zero WebhookEndpoint rows (clean migration).

ALTER TABLE "WebhookEndpoint" DROP COLUMN "secretHash";

ALTER TABLE "WebhookEndpoint" ADD COLUMN "secretEncrypted" VARCHAR(512) NOT NULL;

CREATE UNIQUE INDEX "WebhookDelivery_tenantId_endpointId_eventId_key" ON "WebhookDelivery"("tenantId", "endpointId", "eventId");
