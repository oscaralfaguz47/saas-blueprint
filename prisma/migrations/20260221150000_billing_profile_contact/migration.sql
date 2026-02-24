-- Add contact details to BillingProfile for invoice/checkout identity.
ALTER TABLE "BillingProfile" ADD COLUMN "contactName" VARCHAR(200);
ALTER TABLE "BillingProfile" ADD COLUMN "contactEmail" VARCHAR(191);
